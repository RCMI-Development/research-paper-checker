import json
import queue
import threading

from django.conf import settings
from django.db import connection, transaction
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditEvent, Case, Certification, ScreeningRun
from .permissions import ConfiguredAuthenticationPermission
from .services import (
    ServiceError,
    create_document,
    get_models,
    get_or_create_case,
    read_upload,
    request_user,
    run_screenings,
    validate_text,
    verdict_for,
)


def error_response(exc, code=status.HTTP_400_BAD_REQUEST):
    return Response({"error": str(exc)}, status=code)


def update_case_status(case):
    if case.screenings.filter(verdict__in=["review", "stop", "unknown"]).exists():
        case.status = Case.Status.REVIEW
    elif (
        case.screenings.filter(screening_type__in=["dgof", "iroc"]).exists()
        and not case.screenings.filter(
            screening_type__in=["dgof", "iroc"], certification__isnull=True
        ).exists()
    ):
        case.status = Case.Status.CERTIFIED
    elif case.screenings.exists():
        case.status = Case.Status.SCREENED
    else:
        case.status = Case.Status.DRAFT
    case.save(update_fields=["status", "updated_at"])


def latest_screening(case, screening_type):
    return case.screenings.filter(screening_type=screening_type).first()


def case_summary(case):
    latest = {kind: latest_screening(case, kind) for kind in ("dei", "dgof", "iroc")}
    certification = (
        Certification.objects.filter(screening__case=case)
        .select_related("screening")
        .order_by("-signed_at")
        .first()
    )
    document = case.documents.first()
    verdicts = [run.verdict for run in latest.values() if run]
    verdict = next(
        (candidate for candidate in ("stop", "review", "unknown", "clear", "informativo") if candidate in verdicts),
        None,
    )
    return {
        "id": case.pk,
        "case_no": case.case_no,
        "file_name": document.original_name if document else None,
        "verdict": verdict,
        "model": next((run.model_name for run in latest.values() if run and run.model_name), None),
        "signer": certification.signer_name if certification else None,
        "signed_at": certification.signed_at.isoformat() if certification else None,
        "created_at": case.created_at.isoformat(),
        "status": case.status,
    }


class HealthView(ConfiguredAuthenticationPermission, APIView):
    def get(self, request):
        try:
            models = get_models()
            return Response(
                {"ok": True, "reachable": True, "models": models, "defaultModel": settings.LM_STUDIO_MODEL}
            )
        except Exception as exc:
            return Response(
                {
                    "ok": True,
                    "reachable": False,
                    "error": str(exc),
                    "defaultModel": settings.LM_STUDIO_MODEL,
                }
            )


class CaseNumberView(ConfiguredAuthenticationPermission, APIView):
    def get(self, request):
        try:
            case = get_or_create_case(None, request_user(request))
            return Response({"caseNo": case.case_no})
        except ServiceError as exc:
            return error_response(exc)


class ExtractView(ConfiguredAuthenticationPermission, APIView):
    parser_classes = [MultiPartParser, FormParser]

    @transaction.atomic
    def post(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return error_response("No se recibió ningún archivo.")
        try:
            user = request_user(request)
            raw, text = read_upload(upload)
            validate_text(text)
            case = get_or_create_case(request.data.get("caseNo"), user)
            document = create_document(case, text, user, upload, raw)
            return Response(
                {
                    "caseNo": case.case_no,
                    "fileName": document.original_name,
                    "filePath": document.file.name,
                    "documentId": document.pk,
                    "text": text,
                }
            )
        except ServiceError as exc:
            return error_response(exc)


HEARTBEAT_SECONDS = 15


def evaluate_pipeline(*, text, tasks_raw, model, case_no, upload, user, emit=None):
    """Un cotejo completo, de la radicación al expediente guardado.

    `emit(stage, **detail)` marca cada etapa: la vista sin streaming lo deja
    vacío y la de streaming lo encola. Se llama también desde los hilos de
    `run_screenings`, así que tiene que ser seguro entre hilos.
    """
    emit = emit or (lambda *args, **kwargs: None)

    emit("extract")
    raw = b""
    if upload:
        raw, text = read_upload(upload)
    validate_text(text)

    requested_tasks = [item.strip() for item in tasks_raw.split(",")]
    tasks = list(dict.fromkeys(item for item in requested_tasks if item in {"dgof", "iroc"}))

    emit("case")
    case = get_or_create_case(case_no, user)
    document = create_document(case, text, user, upload, raw)

    reports = run_screenings(tasks, text, model, on_event=emit)

    emit("saving")
    screening_ids = {}
    with transaction.atomic():
        now = timezone.now()
        for task, report in reports.items():
            run = ScreeningRun.objects.create(
                case=case,
                document=document,
                screening_type=task,
                model_name=model,
                report=report,
                verdict=verdict_for(task, report),
                created_by=user,
                completed_at=now,
            )
            screening_ids[task] = run.pk
            AuditEvent.objects.create(
                case=case,
                actor=user,
                action="screening.completed",
                metadata={"screening_id": run.pk, "type": task, "verdict": run.verdict},
            )
        update_case_status(case)

    return {
        "caseNo": case.case_no,
        "fileName": document.original_name or None,
        "filePath": document.file.name if document.file else None,
        "documentId": document.pk,
        "screeningIds": screening_ids,
        "proposalExcerpt": text[:4000],
        "model": model,
        "dgof": reports.get("dgof"),
        "iroc": reports.get("iroc"),
    }


def evaluate_arguments(request):
    """El cuerpo se lee en el hilo de la petición: una vez devuelta la
    respuesta en streaming, el request ya no se puede parsear."""
    return {
        "text": request.data.get("text", ""),
        "tasks_raw": request.data.get("tasks", "dgof,iroc"),
        "model": request.data.get("model") or settings.LM_STUDIO_MODEL,
        "case_no": request.data.get("caseNo"),
        "upload": request.FILES.get("file"),
        "user": request_user(request),
    }


class EvaluateView(ConfiguredAuthenticationPermission, APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        try:
            return Response(evaluate_pipeline(**evaluate_arguments(request)))
        except ServiceError as exc:
            return error_response(exc)


def sse_event(name, payload):
    return f"event: {name}\ndata: {json.dumps(payload)}\n\n"


class EvaluateStreamView(ConfiguredAuthenticationPermission, APIView):
    """El mismo cotejo que /api/evaluate, informando cada etapa por SSE.

    El trabajo corre en un hilo aparte y publica eventos en una cola; el
    generador la vacía y, cuando no hay nada, manda un latido para que el
    cotejo (hasta 180 s de espera) no se vea como una conexión colgada.
    """

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        arguments = evaluate_arguments(request)
        events = queue.Queue()

        def emit(stage, **detail):
            events.put(("stage", {"stage": stage, **detail}))

        def worker():
            try:
                events.put(("done", evaluate_pipeline(**arguments, emit=emit)))
            except ServiceError as exc:
                events.put(("error", {"error": str(exc)}))
            except Exception as exc:
                events.put(("error", {"error": f"La evaluación no se completó: {exc}"}))
            finally:
                # El hilo abrió su propia conexión a la base de datos.
                connection.close()
                events.put(None)

        def stream():
            yield sse_event("stage", {"stage": "received"})
            while True:
                try:
                    item = events.get(timeout=HEARTBEAT_SECONDS)
                except queue.Empty:
                    yield ": latido\n\n"
                    continue
                if item is None:
                    return
                yield sse_event(*item)

        threading.Thread(target=worker, daemon=True).start()
        response = StreamingHttpResponse(stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache, no-transform"
        # Nginx/Caddy tienen que dejar pasar el stream sin acumularlo.
        response["X-Accel-Buffering"] = "no"
        return response


class CaseListCreateView(ConfiguredAuthenticationPermission, APIView):
    parser_classes = [JSONParser]

    def get(self, request):
        return Response([case_summary(case) for case in Case.objects.all()])

    @transaction.atomic
    def post(self, request):
        case_no = request.data.get("caseNo")
        verdict = request.data.get("verdict")
        if not case_no or not verdict:
            return error_response("Faltan caseNo o verdict")
        try:
            user = request_user(request)
            case = get_or_create_case(case_no, user)
            signer_name = str(request.data.get("signer") or "").strip()
            submitted_types = [kind for kind in ("dei", "dgof", "iroc") if request.data.get(kind)]
            if signer_name and (verdict != "clear" or not set(submitted_types) & {"dgof", "iroc"}):
                return error_response("Solo un cotejo sin hallazgos puede certificarse.")
            if signer_name and settings.REQUIRE_AUTH and not user.has_perm("screener.add_certification"):
                return Response(
                    {"error": "La cuenta no tiene permiso para certificar expedientes."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            document = case.documents.first()
            if not document and request.data.get("proposalExcerpt"):
                document = create_document(case, request.data["proposalExcerpt"], user)

            saved_runs = {}
            for kind in ("dei", "dgof", "iroc"):
                report = request.data.get(kind)
                if not report:
                    continue
                run_id = (request.data.get("screeningIds") or {}).get(kind)
                run = case.screenings.filter(pk=run_id, screening_type=kind).first() if run_id else None
                if not run:
                    candidate = latest_screening(case, kind)
                    run = candidate if candidate and candidate.report == report else None
                if not run:
                    run = ScreeningRun(case=case, document=document, screening_type=kind, created_by=user)
                run.report = report
                run.verdict = verdict
                run.model_name = request.data.get("model", "")
                run.completed_at = run.completed_at or timezone.now()
                run.save()
                saved_runs[kind] = run

            if signer_name:
                certifiable = [run for kind, run in saved_runs.items() if kind in {"dgof", "iroc"}]
                for run in certifiable:
                    Certification.objects.update_or_create(
                        screening=run,
                        defaults={
                            "signer": user,
                            "signer_name": user.get_full_name() or user.get_username()
                            if user
                            else signer_name,
                        },
                    )
                    AuditEvent.objects.create(
                        case=case,
                        actor=user,
                        action="certification.signed",
                        metadata={"screening_id": run.pk, "signer_name": signer_name},
                    )
            elif saved_runs:
                AuditEvent.objects.create(
                    case=case,
                    actor=user,
                    action="screening.saved",
                    metadata={"types": list(saved_runs)},
                )
            update_case_status(case)
            return Response({"ok": True, "case": case_summary(case)})
        except ServiceError as exc:
            return error_response(exc)


class CaseDetailView(ConfiguredAuthenticationPermission, APIView):
    def get(self, request, case_no):
        try:
            case = Case.objects.get(case_no=case_no)
        except Case.DoesNotExist:
            return error_response("No encontrado", status.HTTP_404_NOT_FOUND)
        result = case_summary(case)
        document = case.documents.first()
        result.update(
            {
                "proposal_excerpt": document.excerpt if document else None,
                "file_path": document.file.name if document and document.file else None,
                "dei_report": (run.report if (run := latest_screening(case, "dei")) else None),
                "dgof_report": (run.report if (run := latest_screening(case, "dgof")) else None),
                "iroc_report": (run.report if (run := latest_screening(case, "iroc")) else None),
            }
        )
        return Response(result)

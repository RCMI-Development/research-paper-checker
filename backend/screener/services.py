import hashlib
import json
import re
import secrets
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

import httpx
from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone
from pypdf import PdfReader

from .models import AuditEvent, Case, Document
from .prompts import DGOF_PROMPT, IROC_PROMPT


MAX_UPLOAD_SIZE = 25 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md"}
PROMPTS = {"dgof": DGOF_PROMPT, "iroc": IROC_PROMPT}


class ServiceError(Exception):
    pass


def request_user(request):
    return request.user if request.user.is_authenticated else None


def create_case(user=None):
    year = timezone.localdate().year
    for _ in range(50):
        candidate = f"RCM-{year}-{secrets.randbelow(9000) + 1000}"
        try:
            case = Case.objects.create(case_no=candidate, created_by=user)
        except IntegrityError:
            continue
        AuditEvent.objects.create(case=case, actor=user, action="case.created")
        return case
    raise ServiceError("No se pudo generar un número de expediente único.")


def get_or_create_case(case_no, user=None):
    if case_no:
        try:
            return Case.objects.get(case_no=case_no)
        except Case.DoesNotExist as exc:
            raise ServiceError("El número de expediente no existe.") from exc
    return create_case(user)


def validate_upload(upload):
    if upload.size > MAX_UPLOAD_SIZE:
        raise ServiceError("El archivo excede el límite de 25 MB.")
    suffix = "." + upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else ""
    if suffix not in ALLOWED_EXTENSIONS:
        raise ServiceError("Solo se aceptan archivos PDF, TXT o Markdown.")
    return suffix


def read_upload(upload):
    suffix = validate_upload(upload)
    raw = upload.read()
    upload.seek(0)
    try:
        if suffix == ".pdf":
            reader = PdfReader(BytesIO(raw))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        else:
            text = raw.decode("utf-8")
    except Exception as exc:
        raise ServiceError("No se pudo extraer el texto del documento.") from exc
    return raw, text


def validate_text(text):
    if not text or len(text.strip()) < 40:
        raise ServiceError("El texto de la propuesta es demasiado corto o no se pudo extraer.")
    return text


def create_document(case, text, user=None, upload=None, raw=b""):
    document = Document(
        case=case,
        original_name=upload.name if upload else "",
        extracted_text=text,
        excerpt=text[:4000],
        sha256=hashlib.sha256(raw or text.encode("utf-8")).hexdigest(),
        uploaded_by=user,
    )
    if upload:
        document.file = upload
    document.save()
    AuditEvent.objects.create(
        case=case,
        actor=user,
        action="document.uploaded" if upload else "document.created_from_text",
        metadata={"document_id": document.pk, "filename": document.original_name},
    )
    return document


def extract_json(raw):
    cleaned = re.sub(r"```(?:json)?|```", "", raw, flags=re.IGNORECASE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                pass
    raise ServiceError("El modelo no devolvió JSON válido.")


def get_models():
    response = httpx.get(
        f"{settings.LM_STUDIO_URL}/models",
        timeout=min(settings.LM_STUDIO_TIMEOUT, 15),
    )
    response.raise_for_status()
    data = response.json()
    return [item["id"] for item in data.get("data", []) if item.get("id")]


def ask_lm_studio(task, proposal_text, model):
    try:
        response = httpx.post(
            f"{settings.LM_STUDIO_URL}/chat/completions",
            headers={"Content-Type": "application/json"},
            json={
                "model": model,
                "temperature": 0.2,
                "max_tokens": 1200,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a compliance screening assistant. Respond with strict JSON only — no markdown fences, no commentary, no text before or after the JSON object.",
                    },
                    {
                        "role": "user",
                        "content": f"{PROMPTS[task]}\n\n<propuesta>\n{proposal_text}\n</propuesta>",
                    },
                ],
            },
            timeout=settings.LM_STUDIO_TIMEOUT,
        )
        response.raise_for_status()
        raw = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise ServiceError(f"No se pudo completar la evaluación con LM Studio: {exc}") from exc
    return extract_json(raw)


def run_screenings(tasks, text, model, on_event=None):
    """`on_event(stage, **detail)` se llama desde los hilos trabajadores, así que
    tiene que ser seguro entre hilos (la vista en streaming le pasa una cola)."""
    if not tasks:
        raise ServiceError("No se indicó ningún cotejo válido.")
    notify = on_event or (lambda *args, **kwargs: None)

    def screen(task):
        notify("screening.started", task=task)
        report = ask_lm_studio(task, text, model)
        notify("screening.completed", task=task)
        return report

    with ThreadPoolExecutor(max_workers=len(tasks)) as executor:
        futures = {task: executor.submit(screen, task) for task in tasks}
        return {task: future.result() for task, future in futures.items()}


def verdict_for(task, report):
    determination = report.get("determination")
    if task == "dgof":
        return {
            "none": "clear",
            "potential": "review",
            "likely": "stop",
            "insufficient": "unknown",
        }.get(determination, "unknown")
    return {
        "none": "clear",
        "review_needed": "review",
        "prohibited_risk": "stop",
        "insufficient": "unknown",
    }.get(determination, "unknown")


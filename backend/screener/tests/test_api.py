import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase, APITransactionTestCase

from screener.models import AuditEvent, Case, Certification, Document, ScreeningRun


class ApiTests(APITestCase):
    def setUp(self):
        self.media_directory = tempfile.mkdtemp()
        self.media_override = override_settings(MEDIA_ROOT=self.media_directory, REQUIRE_AUTH=False)
        self.media_override.enable()

    def tearDown(self):
        self.media_override.disable()
        shutil.rmtree(self.media_directory, ignore_errors=True)

    def test_case_number_reserves_case(self):
        response = self.client.get("/api/case-number")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["caseNo"].startswith("RCM-"))
        self.assertTrue(Case.objects.filter(case_no=response.data["caseNo"]).exists())
        self.assertTrue(AuditEvent.objects.filter(action="case.created").exists())

    def test_extract_text_file_creates_private_document(self):
        upload = SimpleUploadedFile(
            "proposal.txt",
            b"This is a sufficiently long research proposal for extraction and persistence.",
            content_type="text/plain",
        )

        response = self.client.post("/api/extract", {"file": upload}, format="multipart")

        self.assertEqual(response.status_code, 200)
        document = Document.objects.get(pk=response.data["documentId"])
        self.assertEqual(document.original_name, "proposal.txt")
        self.assertEqual(document.case.case_no, response.data["caseNo"])
        self.assertTrue(Path(document.file.path).exists())
        self.assertEqual(len(document.sha256), 64)

    @patch("screener.views.run_screenings")
    def test_evaluation_persists_structured_screening(self, run_screenings):
        run_screenings.return_value = {
            "dgof": {
                "determination": "none",
                "agents": [],
                "in_silico_only": False,
                "outcomes": [],
                "rationale": "No DGOF nexus was identified.",
                "ask_pi": [],
            }
        }

        response = self.client.post(
            "/api/evaluate",
            {
                "text": "This proposal contains enough ordinary clinical research text to be evaluated.",
                "tasks": "dgof",
                "model": "local-test-model",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        run = ScreeningRun.objects.get(pk=response.data["screeningIds"]["dgof"])
        self.assertEqual(run.report["determination"], "none")
        self.assertEqual(run.verdict, "clear")
        self.assertEqual(run.case.status, Case.Status.SCREENED)

    @patch("screener.views.run_screenings")
    def test_clear_screening_can_be_certified_without_duplicate_run(self, run_screenings):
        report = {
            "determination": "none",
            "agents": [],
            "in_silico_only": False,
            "outcomes": [],
            "rationale": "No DGOF nexus was identified.",
            "ask_pi": [],
        }
        run_screenings.return_value = {"dgof": report}
        evaluation = self.client.post(
            "/api/evaluate",
            {
                "text": "This proposal contains enough ordinary clinical research text to be evaluated.",
                "tasks": "dgof",
                "model": "local-test-model",
            },
            format="multipart",
        )

        response = self.client.post(
            "/api/cases",
            {
                "caseNo": evaluation.data["caseNo"],
                "proposalExcerpt": evaluation.data["proposalExcerpt"],
                "dgof": report,
                "verdict": "clear",
                "model": "local-test-model",
                "signer": "Dra. Certificadora",
                "screeningIds": evaluation.data["screeningIds"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ScreeningRun.objects.count(), 1)
        certification = Certification.objects.get()
        self.assertEqual(certification.signer_name, "Dra. Certificadora")
        self.assertEqual(certification.screening.case.status, Case.Status.CERTIFIED)

    def test_non_clear_screening_cannot_be_certified(self):
        case = Case.objects.create(case_no="RCM-2026-1000")
        run = ScreeningRun.objects.create(
            case=case,
            screening_type="dgof",
            report={"determination": "potential"},
            verdict="review",
        )

        response = self.client.post(
            "/api/cases",
            {
                "caseNo": case.case_no,
                "dgof": run.report,
                "verdict": "review",
                "signer": "Not Allowed",
                "screeningIds": {"dgof": run.pk},
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Certification.objects.count(), 0)

    def test_case_with_certification_and_outstanding_review_stays_in_review(self):
        case = Case.objects.create(case_no="RCM-2026-1002")
        clear_run = ScreeningRun.objects.create(
            case=case,
            screening_type="dgof",
            report={"determination": "none"},
            verdict="clear",
        )
        Certification.objects.create(screening=clear_run, signer_name="Reviewer")
        ScreeningRun.objects.create(
            case=case,
            screening_type="iroc",
            report={"determination": "review_needed"},
            verdict="review",
        )

        response = self.client.post(
            "/api/cases",
            {
                "caseNo": case.case_no,
                "iroc": {"determination": "review_needed"},
                "verdict": "review",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        case.refresh_from_db()
        self.assertEqual(case.status, Case.Status.REVIEW)

    def test_case_detail_returns_latest_structured_reports(self):
        case = Case.objects.create(case_no="RCM-2026-1001")
        ScreeningRun.objects.create(
            case=case,
            screening_type="dei",
            report={"total": 3},
            verdict="informativo",
        )

        response = self.client.get(f"/api/cases/{case.case_no}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["dei_report"], {"total": 3})

    @override_settings(REQUIRE_AUTH=True)
    def test_shared_mode_requires_an_authenticated_session(self):
        anonymous_response = self.client.get("/api/case-number")

        user = get_user_model().objects.create_user(username="reviewer", password="test-password")
        self.client.force_authenticate(user)
        authenticated_response = self.client.get("/api/case-number")

        self.assertEqual(anonymous_response.status_code, 403)
        self.assertEqual(authenticated_response.status_code, 200)

    @override_settings(REQUIRE_AUTH=True)
    def test_authenticated_certifier_needs_explicit_permission(self):
        user = get_user_model().objects.create_user(
            username="certifier",
            first_name="Ada",
            last_name="Reviewer",
        )
        self.client.force_authenticate(user)
        case = Case.objects.create(case_no="RCM-2026-1003")
        run = ScreeningRun.objects.create(
            case=case,
            screening_type="dgof",
            report={"determination": "none"},
            verdict="clear",
        )
        payload = {
            "caseNo": case.case_no,
            "dgof": run.report,
            "verdict": "clear",
            "signer": "Typed Name",
            "screeningIds": {"dgof": run.pk},
        }

        denied = self.client.post("/api/cases", payload, format="json")
        user.user_permissions.add(Permission.objects.get(codename="add_certification"))
        user = get_user_model().objects.get(pk=user.pk)
        self.client.force_authenticate(user)
        allowed = self.client.post("/api/cases", payload, format="json")

        self.assertEqual(denied.status_code, 403)
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(Certification.objects.get().signer, user)
        self.assertEqual(Certification.objects.get().signer_name, "Ada Reviewer")


class EvaluationStreamTests(APITransactionTestCase):
    """El cotejo en streaming corre en un hilo aparte, con su propia conexión a
    la base de datos: necesita transacciones reales, no el rollback de TestCase."""

    def setUp(self):
        self.media_directory = tempfile.mkdtemp()
        self.media_override = override_settings(MEDIA_ROOT=self.media_directory, REQUIRE_AUTH=False)
        self.media_override.enable()

    def tearDown(self):
        self.media_override.disable()
        shutil.rmtree(self.media_directory, ignore_errors=True)

    def read_stream(self, response):
        """Descompone la respuesta SSE en (evento, datos), ignorando latidos."""
        body = b"".join(response.streaming_content).decode("utf-8")
        events = []
        for block in body.split("\n\n"):
            lines = [line for line in block.splitlines() if not line.startswith(":")]
            name = next((line[len("event: ") :] for line in lines if line.startswith("event: ")), None)
            data = next((line[len("data: ") :] for line in lines if line.startswith("data: ")), None)
            if name and data:
                events.append((name, json.loads(data)))
        return events

    @patch("screener.views.run_screenings")
    def test_evaluation_stream_reports_stages_then_the_same_payload(self, run_screenings):
        report = {
            "determination": "none",
            "agents": [],
            "in_silico_only": False,
            "outcomes": [],
            "rationale": "No DGOF nexus was identified.",
            "ask_pi": [],
        }
        run_screenings.return_value = {"dgof": report}

        response = self.client.post(
            "/api/evaluate/stream",
            {
                "text": "This proposal contains enough ordinary clinical research text to be evaluated.",
                "tasks": "dgof",
                "model": "local-test-model",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/event-stream")
        events = self.read_stream(response)
        stages = [data["stage"] for name, data in events if name == "stage"]
        self.assertEqual(stages, ["received", "extract", "case", "saving"])

        name, payload = events[-1]
        self.assertEqual(name, "done")
        self.assertEqual(payload["dgof"], report)
        run = ScreeningRun.objects.get(pk=payload["screeningIds"]["dgof"])
        self.assertEqual(run.verdict, "clear")
        self.assertEqual(run.case.status, Case.Status.SCREENED)

    def test_evaluation_stream_reports_failures_as_an_event_not_a_status(self):
        response = self.client.post(
            "/api/evaluate/stream",
            {"text": "muy corto", "tasks": "dgof"},
            format="multipart",
        )

        # El stream ya mandó cabeceras 200: el fallo tiene que viajar como evento.
        self.assertEqual(response.status_code, 200)
        name, payload = self.read_stream(response)[-1]
        self.assertEqual(name, "error")
        self.assertIn("demasiado corto", payload["error"])
        self.assertEqual(ScreeningRun.objects.count(), 0)

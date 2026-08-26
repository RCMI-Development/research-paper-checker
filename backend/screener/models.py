import uuid
from pathlib import Path

from django.conf import settings
from django.db import models


def document_upload_path(instance, filename):
    safe_name = Path(filename).name
    return f"{instance.case.case_no}/{uuid.uuid4().hex}-{safe_name}"


class Case(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Borrador"
        SCREENED = "screened", "Cotejado"
        REVIEW = "review", "Requiere revisión"
        CERTIFIED = "certified", "Certificado"

    case_no = models.CharField(max_length=40, unique=True, db_index=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_cases",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_cases",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.case_no


class Document(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="documents")
    original_name = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to=document_upload_path, blank=True)
    extracted_text = models.TextField(blank=True)
    excerpt = models.TextField(blank=True)
    sha256 = models.CharField(max_length=64, blank=True, db_index=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="uploaded_documents",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.original_name or f"Texto de {self.case.case_no}"


class ScreeningRun(models.Model):
    class Type(models.TextChoices):
        DEI = "dei", "DEI"
        DGOF = "dgof", "DGOF"
        IROC = "iroc", "IROC"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="screenings")
    document = models.ForeignKey(
        Document,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="screenings",
    )
    screening_type = models.CharField(max_length=8, choices=Type.choices)
    model_name = models.CharField(max_length=255, blank=True)
    prompt_version = models.CharField(max_length=40, default="2026-07")
    report = models.JSONField(default=dict)
    verdict = models.CharField(max_length=24, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="screening_runs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["case", "screening_type", "-created_at"])]

    def __str__(self):
        return f"{self.case.case_no} · {self.get_screening_type_display()}"


class Certification(models.Model):
    screening = models.OneToOneField(
        ScreeningRun,
        on_delete=models.PROTECT,
        related_name="certification",
    )
    signer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="certifications",
    )
    signer_name = models.CharField(max_length=255)
    attestation = models.TextField(blank=True)
    signed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.screening} · {self.signer_name}"


class AuditEvent(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="audit_events")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_events",
    )
    action = models.CharField(max_length=64)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.case.case_no} · {self.action}"

from django.contrib import admin

from .models import AuditEvent, Case, Certification, Document, ScreeningRun


class DocumentInline(admin.TabularInline):
    model = Document
    extra = 0
    fields = ("original_name", "sha256", "created_at")
    readonly_fields = fields
    can_delete = False


class ScreeningInline(admin.TabularInline):
    model = ScreeningRun
    extra = 0
    fields = ("screening_type", "verdict", "model_name", "completed_at")
    readonly_fields = fields
    can_delete = False


@admin.register(Case)
class CaseAdmin(admin.ModelAdmin):
    list_display = ("case_no", "status", "created_by", "assigned_to", "created_at", "updated_at")
    list_filter = ("status", "created_at")
    search_fields = ("case_no", "documents__original_name")
    readonly_fields = ("case_no", "created_by", "created_at", "updated_at")
    inlines = (DocumentInline, ScreeningInline)


@admin.register(ScreeningRun)
class ScreeningRunAdmin(admin.ModelAdmin):
    list_display = ("case", "screening_type", "verdict", "model_name", "completed_at")
    list_filter = ("screening_type", "verdict", "completed_at")
    search_fields = ("case__case_no", "model_name")
    readonly_fields = ("case", "document", "screening_type", "model_name", "prompt_version", "report", "verdict", "created_by", "created_at", "completed_at")


@admin.register(Certification)
class CertificationAdmin(admin.ModelAdmin):
    list_display = ("screening", "signer_name", "signer", "signed_at")
    search_fields = ("screening__case__case_no", "signer_name", "signer__username")
    readonly_fields = ("screening", "signer", "signer_name", "attestation", "signed_at")


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("case", "action", "actor", "created_at")
    list_filter = ("action", "created_at")
    search_fields = ("case__case_no", "actor__username")
    readonly_fields = ("case", "actor", "action", "metadata", "created_at")


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("case", "original_name", "sha256", "created_at")
    search_fields = ("case__case_no", "original_name", "sha256")
    readonly_fields = ("case", "original_name", "file", "extracted_text", "excerpt", "sha256", "uploaded_by", "created_at")


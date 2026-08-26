import json
import sqlite3
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from screener.models import AuditEvent, Case, Certification, Document, ScreeningRun


def parse_legacy_datetime(value):
    parsed = parse_datetime(value or "")
    if parsed and timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_default_timezone())
    return parsed


class Command(BaseCommand):
    help = "Import records from the original Node SQLite cases table. Safe to run repeatedly."

    def add_arguments(self, parser):
        parser.add_argument(
            "--source",
            default=str(settings.REPO_ROOT / "data" / "cases.db"),
            help="Path to the legacy SQLite database.",
        )

    def handle(self, *args, **options):
        source = Path(options["source"])
        if not source.exists():
            raise CommandError(f"Legacy database not found: {source}")
        connection = sqlite3.connect(source)
        connection.row_factory = sqlite3.Row
        try:
            rows = connection.execute("SELECT * FROM cases ORDER BY created_at").fetchall()
        except sqlite3.DatabaseError as exc:
            raise CommandError(f"Could not read legacy cases: {exc}") from exc
        finally:
            connection.close()

        imported = 0
        for row in rows:
            case, created = Case.objects.get_or_create(
                case_no=row["case_no"],
                defaults={"status": Case.Status.SCREENED},
            )
            legacy_created_at = parse_legacy_datetime(row["created_at"])
            if legacy_created_at:
                Case.objects.filter(pk=case.pk).update(
                    created_at=legacy_created_at,
                    updated_at=legacy_created_at,
                )
                case.refresh_from_db()
            document = case.documents.first()
            if not document and (row["file_name"] or row["proposal_excerpt"]):
                document = Document.objects.create(
                    case=case,
                    original_name=row["file_name"] or "",
                    excerpt=row["proposal_excerpt"] or "",
                    extracted_text=row["proposal_excerpt"] or "",
                )
            for kind, column in (("dei", "dei_report"), ("dgof", "dgof_report"), ("iroc", "iroc_report")):
                raw_report = row[column]
                if not raw_report:
                    continue
                try:
                    report = json.loads(raw_report)
                except json.JSONDecodeError:
                    report = {"legacy_raw": raw_report}
                run = case.screenings.filter(screening_type=kind).first()
                if not run:
                    run = ScreeningRun.objects.create(
                        case=case,
                        document=document,
                        screening_type=kind,
                        model_name=row["model"] or "",
                        report=report,
                        verdict=row["verdict"] or "",
                        completed_at=parse_legacy_datetime(row["signed_at"]) or case.created_at,
                    )
                if row["signer"] and kind in {"dgof", "iroc"}:
                    certification, _ = Certification.objects.get_or_create(
                        screening=run,
                        defaults={"signer_name": row["signer"]},
                    )
                    legacy_signed_at = parse_legacy_datetime(row["signed_at"])
                    if legacy_signed_at:
                        Certification.objects.filter(pk=certification.pk).update(signed_at=legacy_signed_at)
            if row["signer"]:
                case.status = Case.Status.CERTIFIED
                case.save(update_fields=["status", "updated_at"])
            AuditEvent.objects.get_or_create(
                case=case,
                action="legacy.imported",
                defaults={"metadata": {"legacy_id": row["id"]}},
            )
            imported += int(created)
        self.stdout.write(self.style.SUCCESS(f"Imported {imported} new case(s); processed {len(rows)} row(s)."))

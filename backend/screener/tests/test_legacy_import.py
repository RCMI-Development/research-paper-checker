import json
import sqlite3
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase

from screener.models import Case, Certification, ScreeningRun


class LegacyImportTests(TestCase):
    def test_import_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "legacy.db"
            connection = sqlite3.connect(source)
            connection.executescript(
                """
                CREATE TABLE cases (
                    id INTEGER PRIMARY KEY,
                    case_no TEXT,
                    file_name TEXT,
                    file_path TEXT,
                    proposal_excerpt TEXT,
                    dei_report TEXT,
                    dgof_report TEXT,
                    iroc_report TEXT,
                    verdict TEXT,
                    model TEXT,
                    signer TEXT,
                    signed_at TEXT,
                    created_at TEXT
                );
                """
            )
            connection.execute(
                "INSERT INTO cases VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    1,
                    "RCM-2026-4321",
                    "proposal.pdf",
                    None,
                    "Legacy excerpt",
                    None,
                    json.dumps({"determination": "none"}),
                    None,
                    "clear",
                    "legacy-model",
                    "Legacy Signer",
                    "2026-08-20T10:00:00Z",
                    "2026-08-20 09:00:00",
                ),
            )
            connection.commit()
            connection.close()

            call_command("import_legacy_cases", source=str(source), verbosity=0)
            call_command("import_legacy_cases", source=str(source), verbosity=0)

        self.assertEqual(Case.objects.count(), 1)
        self.assertEqual(ScreeningRun.objects.count(), 1)
        self.assertEqual(Certification.objects.count(), 1)

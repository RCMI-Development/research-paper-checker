import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

/* En una instalación nueva data/ no existe y SQLite no crea el directorio:
   sin esto el servidor no arranca. */
mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });
mkdirSync(path.join(DATA_DIR, "certificados"), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "cases.db"));

db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_no TEXT NOT NULL UNIQUE,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

/* Migración aditiva: las bases creadas antes de los certificados no tienen
   estas columnas. Se añaden sin tocar los expedientes ya guardados. */
const columns = new Set(db.prepare("PRAGMA table_info(cases)").all().map((c) => c.name));
for (const [name, decl] of [
  ["pi_name", "TEXT"],
  ["proposal_title", "TEXT"],
]) {
  if (!columns.has(name)) db.exec(`ALTER TABLE cases ADD COLUMN ${name} ${decl}`);
}

export default db;

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, "..", "data", "cases.db"));

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

export default db;

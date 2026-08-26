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
    pi_name TEXT,
    proposal_title TEXT,
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

const columnas = () => new Set(db.prepare("PRAGMA table_info(cases)").all().map((c) => c.name));

/* Migración aditiva para bases anteriores a los certificados. */
for (const [nombre, tipo] of [["pi_name", "TEXT"], ["proposal_title", "TEXT"]]) {
  if (!columnas().has(nombre)) db.exec(`ALTER TABLE cases ADD COLUMN ${nombre} ${tipo}`);
}

/* Se eliminó el número de expediente. La columna era NOT NULL UNIQUE, así que
   no basta con dejar de escribirla: hay que reconstruir la tabla sin ella,
   conservando los expedientes ya guardados. */
if (columnas().has("case_no")) {
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE cases_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pi_name TEXT,
        proposal_title TEXT,
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
      );
      INSERT INTO cases_nueva
        (id, pi_name, proposal_title, file_name, file_path, proposal_excerpt,
         dei_report, dgof_report, iroc_report, verdict, model, signer, signed_at, created_at)
      SELECT
         id, pi_name, proposal_title, file_name, file_path, proposal_excerpt,
         dei_report, dgof_report, iroc_report, verdict, model, signer, signed_at, created_at
      FROM cases;
      DROP TABLE cases;
      ALTER TABLE cases_nueva RENAME TO cases;
    `);
    db.exec("COMMIT");
    console.log("Base migrada: se eliminó la columna case_no.");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export default db;

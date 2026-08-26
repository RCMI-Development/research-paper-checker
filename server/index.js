import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import db from "./db.js";
import { DGOF_PROMPT, IROC_PROMPT } from "./prompts.js";
import { construirCertificado, nombreArchivo } from "./certificado.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "..", "data", "uploads");
const DIST_DIR = path.join(__dirname, "..", "dist");
const CERT_DIR = path.join(__dirname, "..", "data", "certificados");

const PORT = process.env.API_PORT || 4000;
/* Solo localhost por defecto: el expediente lleva texto de propuestas sin
   publicar, así que no debe quedar expuesto a la red del recinto. */
const HOST = process.env.HOST || "127.0.0.1";
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://localhost:1234/v1";
/* Modelo fijo: la interfaz ya no permite escogerlo. */
const MODEL = process.env.LM_STUDIO_MODEL || "openai/gpt-oss-20b";

const app = express();
app.use(express.json({ limit: "2mb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function caseNumber() {
  const year = new Date().getFullYear();
  for (let i = 0; i < 20; i++) {
    const n = Math.floor(Math.random() * 9000 + 1000);
    const candidate = `RCM-${year}-${n}`;
    const exists = db.prepare("SELECT 1 FROM cases WHERE case_no = ?").get(candidate);
    if (!exists) return candidate;
  }
  return `RCM-${year}-${Date.now()}`;
}

function extractJson(raw) {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("El modelo no devolvió JSON válido");
  }
}

async function askLmStudio(prompt, proposalText) {
  const res = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      /* gpt-oss-20b gasta parte del presupuesto en tokens de razonamiento
         antes de emitir el JSON; con 1200 se quedaba corto. */
      max_tokens: 2500,
      messages: [
        {
          role: "system",
          content: "You are a compliance screening assistant. Respond with strict JSON only — no markdown fences, no commentary, no text before or after the JSON object.",
        },
        { role: "user", content: `${prompt}\n\n<propuesta>\n${proposalText}\n</propuesta>` },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LM Studio respondió ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  return extractJson(raw);
}

app.get("/api/health", async (_req, res) => {
  try {
    const r = await fetch(`${LM_STUDIO_URL}/models`);
    const data = await r.json();
    const ids = data.data?.map((m) => m.id) ?? [];
    res.json({ ok: true, reachable: true, model: MODEL, loaded: ids.includes(MODEL) });
  } catch (e) {
    res.json({ ok: true, reachable: false, error: String(e.message || e), model: MODEL });
  }
});

async function fileToText(file) {
  if (file.mimetype === "application/pdf") {
    const parsed = await pdfParse(file.buffer);
    return parsed.text;
  }
  return file.buffer.toString("utf8");
}

async function persistUpload(file, caseNo) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(UPLOAD_DIR, `${caseNo}-${safeName}`);
  await fs.writeFile(filePath, file.buffer);
  return filePath;
}

/* Reserva un número de expediente sin correr ningún modelo. Lo usa el cotejo
   DEI, que es puramente local y no necesita pasar por LM Studio. */
app.get("/api/case-number", (_req, res) => {
  res.json({ caseNo: caseNumber() });
});

/* Extrae el texto de un PDF sin evaluarlo. */
app.post("/api/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo." });
    const text = await fileToText(req.file);
    if (!text || text.trim().length < 40) {
      return res.status(400).json({ error: "El texto de la propuesta es demasiado corto o no se pudo extraer." });
    }
    const caseNo = caseNumber();
    const filePath = await persistUpload(req.file, caseNo);
    res.json({ caseNo, fileName: req.file.originalname, filePath, text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/evaluate", upload.single("file"), async (req, res) => {
  try {
    let text = req.body.text || "";
    let fileName = null;

    if (req.file) {
      fileName = req.file.originalname;
      text = await fileToText(req.file);
    }

    if (!text || text.trim().length < 40) {
      return res.status(400).json({ error: "El texto de la propuesta es demasiado corto o no se pudo extraer." });
    }

    const caseNo = caseNumber();
    const filePath = req.file ? await persistUpload(req.file, caseNo) : null;

    const tasks = (req.body.tasks ?? "dgof,iroc").split(",").map((t) => t.trim()).filter(Boolean);
    const [dgof, iroc] = await Promise.all([
      tasks.includes("dgof") ? askLmStudio(DGOF_PROMPT, text) : Promise.resolve(null),
      tasks.includes("iroc") ? askLmStudio(IROC_PROMPT, text) : Promise.resolve(null),
    ]);

    res.json({
      caseNo,
      fileName,
      filePath,
      proposalExcerpt: text.slice(0, 4000),
      model: MODEL,
      dgof,
      iroc,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/cases", (req, res) => {
  const { caseNo, fileName, filePath, proposalExcerpt, dei, dgof, iroc,
          verdict, model, signer, piName, proposalTitle } = req.body;
  if (!caseNo || !verdict) return res.status(400).json({ error: "Faltan caseNo o verdict" });

  const stmt = db.prepare(`
    INSERT INTO cases (case_no, file_name, file_path, proposal_excerpt, dei_report, dgof_report, iroc_report, verdict, model, signer, signed_at, pi_name, proposal_title)
    VALUES (@case_no, @file_name, @file_path, @proposal_excerpt, @dei_report, @dgof_report, @iroc_report, @verdict, @model, @signer, @signed_at, @pi_name, @proposal_title)
    ON CONFLICT(case_no) DO UPDATE SET
      dei_report=excluded.dei_report, dgof_report=excluded.dgof_report, iroc_report=excluded.iroc_report,
      verdict=excluded.verdict, model=excluded.model, signer=excluded.signer, signed_at=excluded.signed_at,
      pi_name=excluded.pi_name, proposal_title=excluded.proposal_title
  `);
  stmt.run({
    case_no: caseNo,
    file_name: fileName || null,
    file_path: filePath || null,
    proposal_excerpt: proposalExcerpt || null,
    dei_report: dei ? JSON.stringify(dei) : null,
    dgof_report: dgof ? JSON.stringify(dgof) : null,
    iroc_report: iroc ? JSON.stringify(iroc) : null,
    verdict,
    model: model || null,
    signer: signer || null,
    signed_at: signer ? new Date().toISOString() : null,
    pi_name: piName || null,
    proposal_title: proposalTitle || null,
  });
  res.json({ ok: true });
});

/* Genera y descarga el certificado en PDF. Guarda además una copia en
   data/certificados/ como parte del récord de cumplimiento. */
app.post("/api/certificado", async (req, res) => {
  try {
    const { cotejo, descripcion, piName, proposalTitle, caseNo } = req.body;
    if (!cotejo || !piName || !proposalTitle || !caseNo) {
      return res.status(400).json({ error: "Faltan datos del certificado." });
    }

    const nombre = nombreArchivo({ cotejo, caseNo, piName });
    const doc = construirCertificado({ cotejo, descripcion, piName, proposalTitle, caseNo });

    const trozos = [];
    doc.on("data", (c) => trozos.push(c));
    doc.on("end", async () => {
      const pdf = Buffer.concat(trozos);
      try {
        await fs.mkdir(CERT_DIR, { recursive: true });
        await fs.writeFile(path.join(CERT_DIR, nombre), pdf);
      } catch (e) {
        console.error("No se pudo archivar el certificado:", e.message);
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
      res.setHeader("Content-Length", pdf.length);
      res.end(pdf);
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/cases", (_req, res) => {
  const rows = db.prepare("SELECT id, case_no, pi_name, proposal_title, file_name, verdict, model, signer, signed_at, created_at FROM cases ORDER BY created_at DESC").all();
  res.json(rows);
});

app.get("/api/cases/:caseNo", (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE case_no = ?").get(req.params.caseNo);
  if (!row) return res.status(404).json({ error: "No encontrado" });
  res.json(row);
});

/* En producción el mismo servidor sirve las páginas compiladas, así que el
   índice y los tres cotejos viven en el mismo origen que la API. */
const hasBuild = existsSync(path.join(DIST_DIR, "index.html"));
if (hasBuild) app.use(express.static(DIST_DIR));

app.listen(PORT, HOST, () => {
  console.log(`Servidor de cotejo escuchando en http://localhost:${PORT}`);
  console.log(`LM Studio: ${LM_STUDIO_URL} (modelo fijo: ${MODEL})`);
  if (hasBuild) {
    console.log(`Índice: http://localhost:${PORT}/  ·  cotejos: /dei.html · /dgof.html · /iroc.html`);
  } else {
    console.log("Aviso: no hay build en dist/. Corre `npm run build` para servir las páginas.");
  }
});

import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import db from "./db.js";
import { DGOF_PROMPT, IROC_PROMPT } from "./prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "..", "data", "uploads");

const PORT = process.env.API_PORT || 4000;
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://localhost:1234/v1";
const DEFAULT_MODEL = process.env.LM_STUDIO_MODEL || "openai/gpt-oss-20b";

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

async function askLmStudio(prompt, proposalText, model) {
  const res = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1200,
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
    res.json({ ok: true, reachable: true, models: data.data?.map((m) => m.id) ?? [], defaultModel: DEFAULT_MODEL });
  } catch (e) {
    res.json({ ok: true, reachable: false, error: String(e.message || e), defaultModel: DEFAULT_MODEL });
  }
});

app.post("/api/evaluate", upload.single("file"), async (req, res) => {
  try {
    const model = req.body.model || DEFAULT_MODEL;
    let text = req.body.text || "";
    let fileName = null;

    if (req.file) {
      fileName = req.file.originalname;
      if (req.file.mimetype === "application/pdf") {
        const parsed = await pdfParse(req.file.buffer);
        text = parsed.text;
      } else {
        text = req.file.buffer.toString("utf8");
      }
    }

    if (!text || text.trim().length < 40) {
      return res.status(400).json({ error: "El texto de la propuesta es demasiado corto o no se pudo extraer." });
    }

    const caseNo = caseNumber();

    let filePath = null;
    if (req.file) {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      filePath = path.join(UPLOAD_DIR, `${caseNo}-${safeName}`);
      await fs.writeFile(filePath, req.file.buffer);
    }

    const [dgof, iroc] = await Promise.all([
      askLmStudio(DGOF_PROMPT, text, model),
      askLmStudio(IROC_PROMPT, text, model),
    ]);

    res.json({
      caseNo,
      fileName,
      filePath,
      proposalExcerpt: text.slice(0, 4000),
      model,
      dgof,
      iroc,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/cases", (req, res) => {
  const { caseNo, fileName, filePath, proposalExcerpt, dei, dgof, iroc, verdict, model, signer } = req.body;
  if (!caseNo || !verdict) return res.status(400).json({ error: "Faltan caseNo o verdict" });

  const stmt = db.prepare(`
    INSERT INTO cases (case_no, file_name, file_path, proposal_excerpt, dei_report, dgof_report, iroc_report, verdict, model, signer, signed_at)
    VALUES (@case_no, @file_name, @file_path, @proposal_excerpt, @dei_report, @dgof_report, @iroc_report, @verdict, @model, @signer, @signed_at)
    ON CONFLICT(case_no) DO UPDATE SET
      dei_report=excluded.dei_report, dgof_report=excluded.dgof_report, iroc_report=excluded.iroc_report,
      verdict=excluded.verdict, model=excluded.model, signer=excluded.signer, signed_at=excluded.signed_at
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
  });
  res.json({ ok: true });
});

app.get("/api/cases", (_req, res) => {
  const rows = db.prepare("SELECT id, case_no, file_name, verdict, model, signer, signed_at, created_at FROM cases ORDER BY created_at DESC").all();
  res.json(rows);
});

app.get("/api/cases/:caseNo", (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE case_no = ?").get(req.params.caseNo);
  if (!row) return res.status(404).json({ error: "No encontrado" });
  res.json(row);
});

app.listen(PORT, () => {
  console.log(`Servidor de cotejo escuchando en http://localhost:${PORT}`);
  console.log(`LM Studio: ${LM_STUDIO_URL} (modelo por defecto: ${DEFAULT_MODEL})`);
});

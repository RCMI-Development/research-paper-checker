import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import db from "./db.js";
import { DGOF_PROMPT, IROC_PROMPT, DGOF_RULES, IROC_RULES } from "./prompts.js";
import { construirCertificado, construirInforme, nombreArchivo } from "./certificado.js";
import { askModel, getModelProvider, getProviderHealth } from "./model-provider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "..", "data", "uploads");
const DIST_DIR = path.join(__dirname, "..", "dist");
const CERT_DIR = path.join(__dirname, "..", "data", "certificados");

const PORT = process.env.API_PORT || 4000;
/* Solo localhost por defecto: el expediente lleva texto de propuestas sin
   publicar, así que no debe quedar expuesto a la red del recinto. */
const HOST = process.env.HOST || "127.0.0.1";
const modelProvider = getModelProvider();

const app = express();
app.use(express.json({ limit: "2mb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

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

async function evaluateWithModel(prompt, proposalText) {
  const data = await askModel(modelProvider, prompt, proposalText);
  const raw = data.choices?.[0]?.message?.content ?? "";
  return extractJson(raw);
}

app.get("/api/health", async (_req, res) => {
  res.json(await getProviderHealth(modelProvider));
});

/* Devuelve el texto separado por página. El número de página es parte del
   hallazgo, así que no basta con el texto plano que da pdf-parse. */
async function fileToPages(file) {
  if (file.mimetype !== "application/pdf") {
    return [file.buffer.toString("utf8")];
  }
  const paginas = [];
  try {
    await pdfParse(file.buffer, {
    pagerender: (pageData) =>
      pageData.getTextContent().then((tc) => {
        const t = tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
        paginas.push(t);
          return t;
        }),
    });
  } catch (e) {
    throw new Error(
      "No se pudo leer el PDF (" + e.message + "). Puede estar dañado o protegido; " +
      "vuelve a exportarlo desde el programa original e inténtalo otra vez."
    );
  }
  return paginas.length ? paginas : [""];
}

const unirPaginas = (paginas) => paginas.join("\n\n");

/* Texto etiquetado que ve el modelo. */
const paginasEtiquetadas = (paginas) =>
  paginas.map((t, i) => `[PAGE ${i + 1}]\n${t}`).join("\n\n");

const normaliza = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]+/gi, " ").replace(/\s+/g, " ").trim();

/* El modelo se equivoca contando páginas. Si la oración aparece de verdad en
   alguna página, esa gana sobre lo que el modelo haya dicho. */
function verificaPagina(hallazgo, paginas) {
  const frase = normaliza(hallazgo.sentence);
  if (frase.length >= 20) {
    const clave = frase.slice(0, 60);
    const idx = paginas.findIndex((p) => normaliza(p).includes(clave));
    if (idx >= 0) return { ...hallazgo, page: idx + 1, verificada: true };
  }
  const n = Number(hallazgo.page);
  return {
    ...hallazgo,
    page: Number.isFinite(n) && n >= 1 && n <= paginas.length ? n : null,
    verificada: false,
  };
}

/* Adjunta el texto canónico del criterio. El modelo solo devuelve el número
   de regla; la redacción sale de aquí para que no derive. */
const revisaHallazgos = (informe, paginas, reglas) =>
  !informe ? informe
    : {
        ...informe,
        findings: (informe.findings || []).map((f) => ({
          ...verificaPagina(f, paginas),
          criterion: reglas[f.rule] || `Regla ${f.rule}`,
        })),
      };

async function persistUpload(file) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const sello = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(UPLOAD_DIR, `${sello}-${safeName}`);
  await fs.writeFile(filePath, file.buffer);
  return filePath;
}

/* Extrae el texto de un PDF sin evaluarlo. */
app.post("/api/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo." });
    const paginas = await fileToPages(req.file);
    const text = unirPaginas(paginas);
    if (!text || text.trim().length < 40) {
      return res.status(400).json({ error: "El texto de la propuesta es demasiado corto o no se pudo extraer." });
    }
    const filePath = await persistUpload(req.file);
    res.json({ fileName: req.file.originalname, filePath, text, pages: paginas });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/evaluate", upload.single("file"), async (req, res) => {
  try {
    let paginas = req.body.text ? [req.body.text] : [];
    let fileName = null;

    if (req.file) {
      fileName = req.file.originalname;
      paginas = await fileToPages(req.file);
    }
    const text = unirPaginas(paginas);

    if (!text || text.trim().length < 40) {
      return res.status(400).json({ error: "El texto de la propuesta es demasiado corto o no se pudo extraer." });
    }

    const filePath = req.file ? await persistUpload(req.file) : null;

    const etiquetado = paginasEtiquetadas(paginas);
    const tasks = (req.body.tasks ?? "dgof,iroc").split(",").map((t) => t.trim()).filter(Boolean);
    const [dgofBruto, irocBruto] = await Promise.all([
      tasks.includes("dgof") ? evaluateWithModel(DGOF_PROMPT, etiquetado) : Promise.resolve(null),
      tasks.includes("iroc") ? evaluateWithModel(IROC_PROMPT, etiquetado) : Promise.resolve(null),
    ]);
    const dgof = revisaHallazgos(dgofBruto, paginas, DGOF_RULES);
    const iroc = revisaHallazgos(irocBruto, paginas, IROC_RULES);

    res.json({
      fileName,
      filePath,
      proposalExcerpt: text.slice(0, 4000),
      numPages: paginas.length,
      model: modelProvider.model,
      provider: modelProvider.id,
      dgof,
      iroc,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/cases", (req, res) => {
  const { id, fileName, filePath, proposalExcerpt, dei, dgof, iroc,
          verdict, model, signer, piName, proposalTitle } = req.body;
  if (!verdict) return res.status(400).json({ error: "Falta verdict" });

  const datos = {
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
  };

  /* Sin número de expediente, la identidad del registro es su id. El cliente
     lo guarda y lo devuelve al reemitir, para actualizar en vez de duplicar. */
  if (id) {
    db.prepare(`
      UPDATE cases SET
        file_name=@file_name, file_path=@file_path, proposal_excerpt=@proposal_excerpt,
        dei_report=@dei_report, dgof_report=@dgof_report, iroc_report=@iroc_report,
        verdict=@verdict, model=@model, signer=@signer, signed_at=@signed_at,
        pi_name=@pi_name, proposal_title=@proposal_title
      WHERE id=@id
    `).run({ ...datos, id });
    return res.json({ ok: true, id });
  }

  const info = db.prepare(`
    INSERT INTO cases (file_name, file_path, proposal_excerpt, dei_report, dgof_report,
                       iroc_report, verdict, model, signer, signed_at, pi_name, proposal_title)
    VALUES (@file_name, @file_path, @proposal_excerpt, @dei_report, @dgof_report,
            @iroc_report, @verdict, @model, @signer, @signed_at, @pi_name, @proposal_title)
  `).run(datos);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

/* Genera y descarga el documento en PDF: certificado si el cotejo pasó,
   informe de hallazgos si no. Archiva una copia en data/certificados/. */
app.post("/api/certificado", async (req, res) => {
  try {
    const { cotejo, descripcion, piName, proposalTitle, findings } = req.body;
    if (!cotejo || !piName || !proposalTitle) {
      return res.status(400).json({ error: "Faltan datos del documento." });
    }

    const esInforme = Array.isArray(findings) && findings.length > 0;
    const nombre = nombreArchivo({
      cotejo, piName, tipo: esInforme ? "Findings-Report" : "Certificado",
    });
    const doc = esInforme
      ? construirInforme({ cotejo, piName, proposalTitle, findings })
      : construirCertificado({ cotejo, descripcion, piName, proposalTitle });

    const trozos = [];
    doc.on("data", (c) => trozos.push(c));
    doc.on("end", async () => {
      const pdf = Buffer.concat(trozos);
      try {
        await fs.mkdir(CERT_DIR, { recursive: true });
        await fs.writeFile(path.join(CERT_DIR, nombre), pdf);
      } catch (e) {
        console.error("No se pudo archivar el documento:", e.message);
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
  const rows = db.prepare("SELECT id, pi_name, proposal_title, file_name, verdict, model, signer, signed_at, created_at FROM cases ORDER BY created_at DESC").all();
  res.json(rows);
});

app.get("/api/cases/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "No encontrado" });
  res.json(row);
});

/* En producción el mismo servidor sirve las páginas compiladas, así que el
   índice y los tres cotejos viven en el mismo origen que la API. */
const hasBuild = existsSync(path.join(DIST_DIR, "index.html"));
if (hasBuild) app.use(express.static(DIST_DIR));

app.listen(PORT, HOST, () => {
  console.log(`Servidor de cotejo escuchando en http://localhost:${PORT}`);
  console.log(`${modelProvider.label}: ${modelProvider.baseUrl} (modelo: ${modelProvider.model})`);
  if (hasBuild) {
    console.log(`Índice: http://localhost:${PORT}/  ·  cotejos: /dei.html · /dgof.html · /iroc.html`);
  } else {
    console.log("Aviso: no hay build en dist/. Corre `npm run build` para servir las páginas.");
  }
});

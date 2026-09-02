import { useState, useEffect, useMemo, useRef } from "react";

/* ─────────────────────────────────────────────────────────────
   Piezas compartidas por los tres cotejos independientes.

   Flujo de cada página:
     Paso 01  Radicación del PDF
     Paso 02  Resultado — una oración; si hay hallazgos, los conceptos
              y dónde aparecen en el texto; si no, el sello SIN HALLAZGO
     Paso 03  (solo si pasó) datos del investigador y la propuesta
     Paso 04  (solo si pasó) certificado con botón de descarga
   ───────────────────────────────────────────────────────────── */

export const C = {
  paper: "#E5E7E0",
  card: "#FAFAF7",
  rule: "#C3C6BC",
  ink: "#16181C",
  soft: "#5C6068",
  stampBlue: "#2E3A8C",
  stampRed: "#A8202A",
  stampAmber: "#9A6B0F",
  tint: "#EDEFE7",
};

export const F = {
  display: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  body: "'Source Serif 4', Georgia, serif",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
};

export const DEFAULT_DEI_TERMS = [
  "diversity","diverse","equity","equitable","inclusion","inclusive","belonging",
  "underrepresented","underserved","minority","minorities","disparity","disparities",
  "marginalized","health equity","social justice","bias","barriers","cultural competence",
  "intersectional","systemic","advocacy","gender","women","LGBTQ","Hispanic","Latinx",
  "vulnerable populations","socioeconomic","accessibility","multicultural","racial",
  "ethnic","ethnicity","stigma","trauma","discrimination","disability","prejudice",
];

export const DGOF_OUTCOMES = [
  "Agrava las consecuencias dañinas del agente (incl. organismos espejo)",
  "Interrumpe la respuesta inmune o la efectividad de una vacuna",
  "Confiere resistencia a profilácticos o terapéuticos, o evade la detección",
  "Aumenta la estabilidad, transmisibilidad o diseminación",
  "Altera el rango de hospederos o el tropismo",
  "Aumenta la susceptibilidad de la población hospedera",
  "Genera o reconstituye un agente erradicado o extinto",
];

/* ── estilos globales, incluida la hoja de impresión ── */

export function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; }
      button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid ${C.stampBlue}; outline-offset: 2px; }
      .btn { font-family: ${F.display}; text-transform: uppercase; letter-spacing: .1em; font-weight: 600;
             font-size: 14px; padding: 11px 20px; border: 1.5px solid ${C.ink}; background: ${C.ink};
             color: ${C.card}; cursor: pointer; }
      .btn:hover { background: ${C.stampBlue}; border-color: ${C.stampBlue}; }
      .btn[disabled] { opacity: .35; cursor: not-allowed; }
      .btn-ghost { background: transparent; color: ${C.ink}; }
      .btn-ghost:hover { background: ${C.ink}; color: ${C.card}; }
      @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }

      /* Al imprimir sale solo el certificado, sin el resto del expediente. */
      @media print {
        body { background: #fff; }
        body * { visibility: hidden; }
        #certificado, #certificado * { visibility: visible; }
        #certificado {
          position: absolute; left: 0; top: 0; width: 100%;
          margin: 0; border-width: 2px; box-shadow: none;
        }
        .no-print { display: none !important; }
        @page { margin: 18mm; }
      }
    `}</style>
  );
}

/* ── piezas de presentación ── */

export function Label({ children, style }) {
  return (
    <div style={{
      fontFamily: F.display, fontSize: 12, letterSpacing: "0.16em",
      textTransform: "uppercase", color: C.soft, fontWeight: 600, ...style,
    }}>{children}</div>
  );
}

export function Card({ title, eyebrow, children, accent }) {
  return (
    <section style={{
      background: C.card, border: `1px solid ${C.rule}`,
      borderLeft: `4px solid ${accent || C.rule}`, padding: "16px 18px", marginBottom: 16,
    }}>
      {eyebrow && <Label>{eyebrow}</Label>}
      <h3 style={{
        fontFamily: F.display, fontSize: 21, letterSpacing: "0.04em", textTransform: "uppercase",
        margin: "4px 0 12px", fontWeight: 600, color: C.ink,
      }}>{title}</h3>
      {children}
    </section>
  );
}

export function Stamp({ verdict }) {
  const map = {
    clear:    { color: C.stampBlue, text: "SIN HALLAZGO",  sub: "Apto para certificación" },
    findings: { color: C.stampRed,  text: "CON HALLAZGOS",  sub: "No apto para certificación" },
    unknown:  { color: C.soft,      text: "INFORMACIÓN INSUFICIENTE", sub: "Consultar al PI" },
  };
  const v = map[verdict] || map.unknown;
  return (
    <div style={{
      border: `3px double ${v.color}`, color: v.color, padding: "14px 22px",
      transform: "rotate(-1.6deg)", display: "inline-block", textAlign: "center",
      background: "transparent", borderRadius: 3,
    }}>
      <div style={{
        fontFamily: F.display, fontSize: 26, fontWeight: 700,
        letterSpacing: "0.1em", lineHeight: 1, textTransform: "uppercase",
      }}>{v.text}</div>
      <div style={{ fontFamily: F.body, fontSize: 12, fontStyle: "italic", marginTop: 5 }}>{v.sub}</div>
      <div style={{
        fontFamily: F.mono, fontSize: 9.5, marginTop: 7, letterSpacing: "0.1em",
        borderTop: `1px solid ${v.color}`, paddingTop: 5,
      }}>{new Date().toLocaleDateString("es-PR")}</div>
    </div>
  );
}

/* ── estado del proveedor de modelos (sin exponer credenciales al cliente) ── */

export function useModelProvider() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, reachable: false }));
  }, []);
  return health;
}

export function ModelBar({ health }) {
  const provider = health?.providerLabel || "proveedor de IA";
  const estado = health == null
    ? "Conectando al proveedor de IA…"
    : health.configured === false
      ? `${provider} no está configurado — falta la clave API`
    : !health.reachable
      ? `${provider} no está disponible`
      : health.loaded === false
        ? `${provider} en línea, pero ${health.model} no está disponible`
        : `${provider} en línea · modelo ${health.model}`;

  const color = health == null ? C.rule
    : health.reachable && health.loaded !== false ? C.stampBlue : C.stampRed;

  return (
    <div style={{
      marginTop: 14, display: "flex", gap: 7, alignItems: "center",
      fontFamily: F.mono, fontSize: 11.5, color: C.soft,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 8, background: color, flexShrink: 0 }} />
      {estado}
    </div>
  );
}

/* ── armazón de página ── */

export function Shell({ tag, title, blurb, children, bar }) {
  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: F.body }}>
      <GlobalStyle />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "26px 20px 70px" }}>
        <header className="no-print" style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 12, marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
            <div>
              <Label>Recinto de Ciencias Médicas · Decanato de Investigación</Label>
              <h1 style={{
                fontFamily: F.display, fontSize: 36, fontWeight: 700, margin: "2px 0 0",
                letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1,
              }}>{title}</h1>
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 11, color: C.soft, textAlign: "right", lineHeight: 1.7 }}>
              <div>{tag}</div>
            </div>
          </div>
          <p style={{ fontSize: 14.5, margin: "10px 0 0", maxWidth: 640, color: C.soft, lineHeight: 1.55 }}>
            {blurb}
          </p>
          {bar}
        </header>
        {children}
        <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }}
            onClick={() => window.close()}>Cerrar ventana</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }}
            onClick={() => window.location.reload()}>Nuevo expediente</button>
        </div>
        <p className="no-print" style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.65, marginTop: 18, borderTop: `1px solid ${C.rule}`, paddingTop: 14 }}>
          Prototipo. El cotejo automatizado es una ayuda de triaje: reduce el trabajo de lectura,
          no sustituye la atestación del PI ni la certificación del ICDGOF, ambas bajo pena de ley.
          DEI corre enteramente en esta computadora. DGOF e IROC envían el texto extraído
          al proveedor de modelos configurado; con OpenRouter, el texto sale de esta computadora.
        </p>
      </div>
    </div>
  );
}

/* ── Paso 01 — radicación, solo PDF ── */

export function Intake({ file, setFile, onRun, busy, ready, runLabel, err, note }) {
  const fileRef = useRef(null);

  return (
    <Card title="Radicación de la propuesta" eyebrow="Paso 01">
      <p style={{ fontSize: 14, color: C.soft, lineHeight: 1.55, margin: "0 0 12px" }}>
        Sube el documento de la propuesta en PDF.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          {file ? "Cambiar documento" : "Adjuntar PDF"}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md"
          onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
        {file && (
          <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.ink }}>{file.name}</span>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onRun} disabled={!ready}>
          {busy ? "Evaluando…" : runLabel}
        </button>
      </div>
      {note && (
        <p style={{ fontSize: 13, color: C.soft, marginTop: 12, marginBottom: 0, lineHeight: 1.55 }}>{note}</p>
      )}
      {err && (
        <p style={{ color: C.stampRed, fontSize: 14, marginTop: 12, marginBottom: 0 }}>{err}</p>
      )}
    </Card>
  );
}

/* ── Paso 02 — resultado ── */

/* Lista de criterios que no se cumplen: regla, página y la oración
   del documento donde aparece. */
export function Findings({ items }) {
  if (!items?.length) return null;
  return (
    <ol style={{ margin: "14px 0 0", padding: 0, listStyle: "none" }}>
      {items.map((f, i) => (
        <li key={i} style={{ borderTop: `1px solid ${C.rule}`, padding: "12px 0" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{
              fontFamily: F.mono, fontSize: 13, color: C.stampRed, fontWeight: 600,
              minWidth: 20, flexShrink: 0,
            }}>{i + 1}.</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5, lineHeight: 1.45 }}>
                {f.criterion || `Rule ${f.rule}`}
              </div>
              <div style={{
                fontFamily: F.mono, fontSize: 11, color: C.soft, letterSpacing: ".06em",
                marginTop: 3,
              }}>
                {[f.rule ? `RULE ${f.rule}` : null, f.page ? `PAGE ${f.page}` : null]
                  .filter(Boolean).join(" · ")}
              </div>
              {f.sentence && (
                <div style={{
                  fontSize: 13.5, color: C.ink, background: C.tint,
                  borderLeft: `3px solid ${C.stampAmber}`, padding: "8px 11px",
                  marginTop: 7, lineHeight: 1.55, fontStyle: "italic",
                }}>
                  {f.sentence}
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Resultado({ paso, titulo, oracion, verdict, extra, accent }) {
  const limpio = verdict === "clear";
  /* El sello sale siempre. El detalle de los hallazgos vive en el paso 04. */
  const sello = limpio ? "clear" : verdict === "unknown" ? "unknown" : "findings";
  return (
    <Card title={titulo} eyebrow={paso} accent={accent}>
      <p style={{ fontSize: 16, lineHeight: 1.55, margin: 0, fontWeight: limpio ? 400 : 600 }}>
        {oracion}
      </p>
      <div style={{ padding: "18px 0 6px" }}>
        <Stamp verdict={sello} />
      </div>
      {extra}
    </Card>
  );
}

/* ── Paso 03 — datos del documento (se pide en ambos casos) ── */

export function DatosCertificado({
  piName, setPiName, proposalTitle, setProposalTitle, onEmitir, emitido, hayHallazgos,
}) {
  const campo = {
    width: "100%", padding: "10px 12px", border: `1px solid ${C.rule}`,
    fontFamily: F.body, fontSize: 15, background: "#fff",
  };
  const listo = piName.trim() && proposalTitle.trim();
  const etiqueta = hayHallazgos ? "informe de hallazgos" : "certificado";

  return (
    <Card title={`Datos del ${hayHallazgos ? "informe" : "certificado"}`} eyebrow="Paso 03"
      accent={hayHallazgos ? C.stampAmber : C.rule}>
      <p style={{ fontSize: 14, color: C.soft, lineHeight: 1.55, margin: "0 0 14px" }}>
        {hayHallazgos
          ? "Provee los datos con los que se emitirá el informe de hallazgos."
          : "El cotejo no identificó hallazgos. Provee los datos con los que se emitirá el certificado."}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 240px" }}>
          <Label style={{ marginBottom: 5 }}>Nombre del investigador</Label>
          <input value={piName} onChange={(e) => setPiName(e.target.value)}
            placeholder="Nombre y apellidos" style={campo} />
        </label>
        <label style={{ flex: "1 1 280px" }}>
          <Label style={{ marginBottom: 5 }}>Título de la propuesta</Label>
          <input value={proposalTitle} onChange={(e) => setProposalTitle(e.target.value)}
            placeholder="Título tal como se somete" style={campo} />
        </label>
      </div>
      <button className="btn" style={{ marginTop: 14 }} onClick={onEmitir} disabled={!listo}>
        {emitido ? `Actualizar ${etiqueta}` : `Emitir ${etiqueta}`}
      </button>
    </Card>
  );
}

/* ── Paso 04 — documento descargable ── */

function useDescarga({ cotejo, descripcion, piName, proposalTitle, findings }) {
  const [bajando, setBajando] = useState(false);
  const [errorPdf, setErrorPdf] = useState("");

  async function descargar() {
    setBajando(true); setErrorPdf("");
    try {
      const r = await fetch("/api/certificado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cotejo, descripcion, piName, proposalTitle, findings }),
      });
      if (!r.ok) throw new Error("No se pudo generar el PDF");

      const disp = r.headers.get("Content-Disposition") || "";
      const nombre = (disp.match(/filename="([^"]+)"/) || [])[1] || `${cotejo}.pdf`;

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorPdf(e.message || "No se pudo descargar el documento.");
    } finally {
      setBajando(false);
    }
  }
  return { descargar, bajando, errorPdf };
}

function BotonDescarga({ descargar, bajando, errorPdf, texto }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <button className="btn" onClick={descargar} disabled={bajando}>
        {bajando ? "Generando…" : texto}
      </button>
      {errorPdf && <span style={{ fontSize: 13, color: C.stampRed }}>{errorPdf}</span>}
    </div>
  );
}

const AvisoEnvio = () => (
  <div style={{ padding: 14, background: C.tint, border: `1px dashed ${C.stampBlue}`, margin: "14px 0" }}>
    <Label style={{ color: C.stampBlue }}>Próximo paso</Label>
    <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: "6px 0 0" }}>
      Este documento debe ser enviado al <b>Sr. Camacho</b> y a la <b>Dra. Segarra</b>.
    </p>
  </div>
);

export function InformeHallazgos({ cotejo, piName, proposalTitle, findings, guardado }) {
  const d = useDescarga({ cotejo, piName, proposalTitle, findings });
  const fecha = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <Card title="Findings report" eyebrow="Paso 04" accent={C.stampRed}>
      <div style={{ background: "#fff", border: `1px solid ${C.rule}`, padding: "20px 22px", marginBottom: 14 }}>
        <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 700, letterSpacing: ".04em",
          textTransform: "uppercase", color: C.stampRed }}>
          Findings report · {cotejo} screening
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 11.5, color: C.soft, marginTop: 8, lineHeight: 1.8 }}>
          <div>INVESTIGATOR · <span style={{ color: C.ink }}>{piName}</span></div>
          <div>PROPOSAL · <span style={{ color: C.ink }}>{proposalTitle}</span></div>
          <div>DATE · <span style={{ color: C.ink }}>{fecha}</span></div>
        </div>
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.rule}` }}>
          <Findings items={findings} />
        </div>
      </div>
      <AvisoEnvio />
      <BotonDescarga {...d} texto="Descargar informe (PDF)" />
      {guardado === true && (
        <p style={{ fontFamily: F.mono, fontSize: 11.5, color: C.stampBlue, margin: "12px 0 0" }}>
          Guardado en el expediente local
        </p>
      )}
    </Card>
  );
}

export function Certificado({ cotejo, descripcion, piName, proposalTitle, guardado }) {
  const d = useDescarga({ cotejo, descripcion, piName, proposalTitle });
  const fecha = new Date().toLocaleDateString("es-PR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Card title="Certificado" eyebrow="Paso 04">
      <div id="certificado" style={{
        background: "#fff", border: `2px solid ${C.ink}`, padding: "38px 34px",
        textAlign: "center", marginBottom: 16,
      }}>
        <div style={{ fontFamily: F.display, fontSize: 12.5, letterSpacing: "0.18em",
          textTransform: "uppercase", color: C.soft, fontWeight: 600 }}>
          Universidad de Puerto Rico · Recinto de Ciencias Médicas
        </div>
        <div style={{ fontFamily: F.display, fontSize: 12.5, letterSpacing: "0.18em",
          textTransform: "uppercase", color: C.soft, fontWeight: 600, marginTop: 2 }}>
          Decanato de Investigación
        </div>

        <h2 style={{ fontFamily: F.display, fontSize: 34, fontWeight: 700, letterSpacing: "0.05em",
          textTransform: "uppercase", margin: "22px 0 4px", lineHeight: 1.05 }}>
          Certificado de cumplimiento
        </h2>
        <div style={{ fontFamily: F.display, fontSize: 19, letterSpacing: "0.12em",
          textTransform: "uppercase", color: C.stampBlue, fontWeight: 600 }}>
          Cotejo {cotejo}
        </div>

        <div style={{ width: 68, height: 2, background: C.ink, margin: "22px auto" }} />

        <p style={{ fontSize: 15, color: C.soft, margin: "0 0 6px", fontStyle: "italic" }}>
          Se certifica que la propuesta
        </p>
        <p style={{ fontFamily: F.body, fontSize: 21, fontWeight: 600, margin: "0 auto 20px",
          maxWidth: 560, lineHeight: 1.35 }}>
          {proposalTitle}
        </p>

        <p style={{ fontSize: 15, color: C.soft, margin: "0 0 6px", fontStyle: "italic" }}>
          sometida por
        </p>
        <p style={{ fontFamily: F.display, fontSize: 30, fontWeight: 700, letterSpacing: "0.03em",
          margin: "0 0 22px", lineHeight: 1.15 }}>
          {piName}
        </p>

        <p style={{ fontSize: 14.5, lineHeight: 1.65, color: C.ink, maxWidth: 580, margin: "0 auto 26px" }}>
          {descripcion}
        </p>

        <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 14,
          fontFamily: F.mono, fontSize: 11.5, color: C.soft, textAlign: "center" }}>
          <div style={{ letterSpacing: ".08em" }}>FECHA DE EMISIÓN</div>
          <div style={{ color: C.ink, fontSize: 13, marginTop: 2 }}>{fecha}</div>
        </div>

        <p style={{ fontSize: 11.5, color: C.soft, lineHeight: 1.55, marginTop: 18, marginBottom: 0,
          fontStyle: "italic" }}>
          Documento generado por cotejo automatizado como ayuda de triaje. No sustituye
          la atestación del investigador principal ni la certificación del ICDGOF.
        </p>
      </div>

      <div className="no-print"><AvisoEnvio /></div>
      <div className="no-print"><BotonDescarga {...d} texto="Descargar certificado (PDF)" /></div>
      {guardado === true && (
        <p className="no-print" style={{ fontFamily: F.mono, fontSize: 11.5, color: C.stampBlue, margin: "12px 0 0" }}>
          Guardado en el expediente local
        </p>
      )}
    </Card>
  );
}

/* ── lógica compartida ── */

export function scanDei(text, termList) {
  if (!text.trim()) return null;
  const hits = {};
  let total = 0;
  termList.forEach((t) => {
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const m = text.match(re);
    if (m) { hits[t] = m.length; total += m.length; }
  });
  const words = text.trim().split(/\s+/).length;
  return { hits, total, words, density: words ? (total / words) * 1000 : 0 };
}

/* Localiza cada término en las páginas: devuelve la página y la oración
   completa donde aparece, igual que los hallazgos de DGOF/IROC. */
/* La extracción de PDF no siempre deja límites de oración limpios. Si el
   fragmento sale enorme, se recorta a una ventana alrededor del término. */
function recorta(frase, term, max = 280) {
  if (frase.length <= max) return frase;
  const i = frase.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return frase.slice(0, max).trim() + "…";
  const ini = Math.max(0, i - Math.floor(max / 2));
  const fin = Math.min(frase.length, ini + max);
  return (ini > 0 ? "…" : "") + frase.slice(ini, fin).trim() + (fin < frase.length ? "…" : "");
}

export function hallazgosDei(paginas, hits) {
  const salida = [];
  Object.keys(hits).forEach((term) => {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    for (let i = 0; i < paginas.length; i++) {
      const oraciones = (paginas[i] || "").split(/(?<=[.!?])\s+/);
      const frase = oraciones.find((o) => re.test(o));
      if (frase) {
        salida.push({
          criterion: `Use of DEI terminology: "${term}"`,
          page: i + 1,
          sentence: recorta(frase.trim(), term),
        });
        break;
      }
    }
  });
  return salida;
}

/* Extrae el contexto alrededor de cada aparición, para mostrar dónde en el
   texto aparece el término y no solo cuántas veces. */
export function deiSnippets(text, term, max = 2) {
  const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(text)) && out.length < max) {
    const ini = Math.max(0, m.index - 55);
    const fin = Math.min(text.length, m.index + m[0].length + 55);
    out.push(
      (ini > 0 ? "…" : "") +
      text.slice(ini, fin).replace(/\s+/g, " ").trim() +
      (fin < text.length ? "…" : "")
    );
  }
  return out;
}

export function severityOf(kind, determination) {
  if (kind === "dgof") {
    if (determination === "likely") return "stop";
    if (determination === "potential") return "review";
    if (determination === "insufficient") return "unknown";
    return "clear";
  }
  if (determination === "prohibited_risk") return "stop";
  if (determination === "review_needed") return "review";
  if (determination === "insufficient") return "unknown";
  return "clear";
}

export async function runEvaluation({ file, tasks }) {
  const form = new FormData();
  form.append("file", file);
  form.append("tasks", tasks.join(","));

  const r = await fetch("/api/evaluate", { method: "POST", body: form });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Error del servidor");
  return data;
}

export async function extractText(file) {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch("/api/extract", { method: "POST", body: form });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "No se pudo extraer el texto del documento.");
  return data;
}

export async function saveCase(payload) {
  const r = await fetch("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("No se pudo guardar el expediente");
  return r.json();
}

import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import "./rcm.css";

/* ─────────────────────────────────────────────────────────────
   Piezas compartidas por los tres cotejos independientes.
   Cada página (dei / dgof / iroc) se sirve como su propio HTML y
   funciona sola; esto es solo lo que tienen en común.
   ───────────────────────────────────────────────────────────── */

/* Paleta institucional RCM-UPR. Los nombres se quedan como estaban para no
   tocar los tres cotejos; los valores son los de src/rcm.css, que es la copia
   autoritativa. El azul y el rojo ya coincidían antes del cambio de marca. */
export const C = {
  paper: "#F6F4EC",      // --crema
  card: "#FFFFFF",       // --blanco
  rule: "#DCDACE",       // --linea
  ink: "#22262B",        // --tinta
  soft: "#5B6169",       // --gris
  stampBlue: "#2E3A8C",  // --azul
  stampRed: "#A8202A",   // --rojo
  stampAmber: "#7A6A34", // --oro-osc
  tint: "#EFE9D8",       // --oro-claro
  oro: "#9C8948",        // solo decorativo: sobre blanco da 3.45:1
  verde: "#2F6B4F",
  marca: "#EDDFA8",      // resaltado de términos DEI
};

export const F = {
  display: "'Oswald', 'Arial Narrow', sans-serif",
  body: "'Source Sans 3', 'Segoe UI', Helvetica, Arial, sans-serif",
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
  "Enhances harmful consequences of the agent (incl. mirror organisms)",
  "Disrupts immune response or vaccine effectiveness",
  "Confers resistance to prophylactics/therapeutics or evades detection",
  "Increases stability, transmissibility, or dissemination",
  "Alters host range or tropism",
  "Enhances host population susceptibility",
  "Generates or reconstitutes an eradicated or extinct agent",
];

export function initialCaseNumber() {
  return new URLSearchParams(window.location.search).get("caseNo");
}

function csrfToken() {
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function csrfHeaders(extra = {}) {
  const token = csrfToken();
  return token ? { ...extra, "X-CSRFToken": token } : extra;
}

/* ── estilos globales ── */

export function GlobalStyle() {
  return (
    <style>{`
      /* Las fuentes, el reset, :focus-visible y .btn viven en src/rcm.css,
         que esta página ya importa. Aquí queda solo lo propio del cotejo. */

      /* Un botón gris se lee como muerto. Mientras corre el cotejo el botón
         sigue encendido, pero en gris de trabajo y sin responder al clic. */
      .btn[disabled].corriendo { opacity: 1; cursor: progress; background: ${C.soft}; border-color: ${C.soft}; }
      .hilandero { display: inline-block; width: 11px; height: 11px; margin-right: 8px; vertical-align: -1px;
                   border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
                   animation: girar .7s linear infinite; }
      @keyframes girar { to { transform: rotate(360deg); } }

      .barra { position: relative; height: 4px; background: ${C.rule}; overflow: hidden; }
      .barra > i { position: absolute; top: 0; bottom: 0; background: ${C.stampBlue}; }
      .barra.medida > i { left: 0; transition: width .35s ease; }
      /* La llamada al modelo no da porcentaje: barrer es honesto, fingir 87% no. */
      .barra.abierta > i { width: 34%; animation: barrer 1.25s ease-in-out infinite; }
      @keyframes barrer { from { left: -34%; } to { left: 100%; } }

      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; }
        .hilandero { animation: none; }
        .barra.abierta > i { animation: none; width: 100%; opacity: .45; }
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

export function Stamp({ verdict, caseNo }) {
  const map = {
    clear:   { color: C.stampBlue,  text: "SIN HALLAZGOS",     sub: "Apto para certificación" },
    review:  { color: C.stampAmber, text: "REQUIERE REVISIÓN", sub: "Referir al IRE" },
    stop:    { color: C.stampRed,   text: "NO CERTIFICABLE",   sub: "Posible investigación prohibida" },
    unknown: { color: C.soft,       text: "INFORMACIÓN INSUFICIENTE", sub: "Consultar al PI" },
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
      }}>{caseNo} · {new Date().toLocaleDateString("es-PR")}</div>
    </div>
  );
}

/* ── LM Studio ── */

export function useLmStudio() {
  const [health, setHealth] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => {
        setHealth(h);
        setModels(h.models || []);
        setModel(h.models?.includes(h.defaultModel) ? h.defaultModel : h.models?.[0] || h.defaultModel);
      })
      .catch(() => setHealth({ ok: false, reachable: false }));
  }, []);

  return { health, models, model, setModel };
}

export function ModelBar({ health, models, model, setModel }) {
  return (
    <div style={{
      marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center",
      fontFamily: F.mono, fontSize: 11.5, color: C.soft,
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: 8,
          background: health == null ? C.rule : health.reachable ? C.stampBlue : C.stampRed,
        }} />
        {health == null
          ? "Conectando a LM Studio…"
          : health.reachable
            ? "LM Studio en línea (localhost:1234)"
            : "LM Studio no disponible — abre la app y préndelo en Developer › Local Server"}
      </span>
      {models.length > 0 && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Modelo:
          <select value={model} onChange={(e) => setModel(e.target.value)}
            style={{ fontFamily: F.mono, fontSize: 11.5, padding: "3px 6px", border: `1px solid ${C.rule}`, background: "#fff" }}>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/* ── armazón de página ── */

/* Cromo institucional. Se omite cuando `embedded`: en las sobrecapas la
   página anfitriona ya trae su propio masthead y salen dos. Tampoco lleva
   .mainnav — una ventana de cotejo es una tarea, no un sitio que navegar. */
function RcmEncabezado({ title }) {
  return (
    <>
      <div className="utility">
        <div className="wrap">
          <a href="https://rcm1.rcm.upr.edu/">Recinto de Ciencias Médicas</a>
          <span className="sep">|</span>
          <a href="http://upr.edu/">UPR</a>
          <span className="sep">|</span>
          <span>787-758-2525</span>
        </div>
      </div>

      <header className="masthead">
        <div className="wrap">
          <img className="escudo" src="/upr-rcm-logo.webp" width="64" height="64"
            alt="Sello del Recinto de Ciencias Médicas, Universidad de Puerto Rico" />
          <div className="titulos">
            <div className="inst">Universidad de Puerto Rico · Recinto de Ciencias Médicas</div>
            <div className="sitio">
              <a href="/">Agentes de <span>IA</span> para labores administrativas</a>
            </div>
          </div>
          <div className="tag">Decanato de Investigación</div>
        </div>
      </header>

      <nav className="migas" aria-label="Ruta de navegación">
        <div className="wrap">
          <a href="/">Inicio</a>
          {" › "}
          <a href="/dec-invest.html">Decanato de Investigación</a>
          {" › "}
          <span aria-current="page">{title}</span>
        </div>
      </nav>
    </>
  );
}

function RcmPie() {
  return (
    <footer>
      <div className="wrap">
        <div className="legal" style={{ border: 0, marginTop: 0, paddingTop: 0 }}>
          <p>
            © 2026 Universidad de Puerto Rico, Recinto de Ciencias Médicas. Las herramientas listadas
            asisten el trabajo administrativo; no sustituyen la revisión, la firma ni la determinación
            de la persona responsable.
          </p>
          <p>
            El RCM no discrimina por raza, religión, sexo, nacionalidad, edad, origen o condición social
            o económica, impedimento físico o mental, ni afiliación política.
          </p>
          <p style={{ margin: 0 }}>
            Website development, management and hosting by IIS: Integrated Informatics Systems Facility —
            CCRHD Program. Partially supported by CCRHD grant U54 MD007600 (NIMHD) from the National
            Institutes of Health. The content of this website is solely the responsibility of the authors
            and does not necessarily represent the official views of the National Institutes of Health.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* `embedded` = el cotejo corre dentro de la sobrecapa del índice, no en
   ventana propia: no ocupa la pantalla completa y cierra por callback. */
export function Shell({ tag, title, blurb, caseNo, children, bar, embedded, onClose, onReset }) {
  const inFrame = !embedded && typeof window !== "undefined" && window.parent !== window;

  function cerrar() {
    if (embedded) onClose?.();
    else if (inFrame) window.parent.postMessage({ type: "cotejo:close" }, window.location.origin);
    else window.close();
  }

  function nuevo() {
    if (embedded) onReset?.();
    else window.location.href = window.location.pathname;
  }

  return (
    <div style={{
      minHeight: embedded ? 0 : "100vh", background: C.paper, color: C.ink, fontFamily: F.body,
      height: embedded ? "100%" : undefined, overflowY: embedded ? "auto" : undefined,
      display: embedded ? undefined : "flex", flexDirection: embedded ? undefined : "column",
    }}>
      <GlobalStyle />
      {!embedded && <RcmEncabezado title={title} />}
      <div style={{
        flex: embedded ? undefined : 1, width: "100%",
        maxWidth: 900, margin: "0 auto", padding: embedded ? "22px 22px 48px" : "30px 20px 60px",
      }}>
        <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 12, marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
            <div>
              <Label>Recinto de Ciencias Médicas · Decanato de Investigación</Label>
              <h1 style={{
                fontFamily: F.display, fontSize: 36, fontWeight: 700, margin: "2px 0 0",
                letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1,
              }}>{title}</h1>
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 11, color: C.soft, textAlign: "right", lineHeight: 1.7 }}>
              <div>{caseNo || "Sin radicar"}</div>
              <div>{tag}</div>
            </div>
          </div>
          <p style={{ fontSize: 14.5, margin: "10px 0 0", maxWidth: 640, color: C.soft, lineHeight: 1.55 }}>
            {blurb}
          </p>
          {bar}
        </header>
        {children}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }}
            onClick={cerrar}>{embedded || inFrame ? "Cerrar cotejo" : "Cerrar ventana"}</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }}
            onClick={nuevo}>Nuevo expediente</button>
        </div>
        <p style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.65, marginTop: 18, borderTop: `1px solid ${C.rule}`, paddingTop: 14 }}>
          Prototipo. El cotejo automatizado es una ayuda de triaje: reduce el trabajo de lectura,
          no sustituye la atestación del PI ni la certificación del ICDGOF, ambas bajo pena de ley.
          Ninguna determinación de este sistema debe adjuntarse a una propuesta como evidencia de
          cumplimiento. Todo corre en esta computadora — nada del texto de la propuesta sale de aquí.
        </p>
      </div>
      {!embedded && <RcmPie />}
    </div>
  );
}

/* ── progreso del cotejo ──
   El cotejo tarda hasta 180 s. Sin señal el usuario no distingue "pensando"
   de "colgado", así que el servidor manda una etapa por SSE y aquí se pinta. */

const ETAPAS = ["received", "extract", "case", "screening", "saving"];

const ETIQUETA_ETAPA = {
  received: "Propuesta recibida",
  extract: "Leyendo el documento",
  case: "Radicando el expediente",
  screening: "Consultando el modelo local",
  saving: "Guardando en el expediente",
};

export function useRunProgress() {
  const [progress, setProgress] = useState(null);

  const reset = useCallback(() => setProgress(null), []);

  const onStage = useCallback(({ stage, task }) => {
    setProgress((prev) => {
      const base = prev || { stage: "received", tasks: {} };
      if (stage === "screening.started" || stage === "screening.completed") {
        const estado = stage === "screening.started" ? "corriendo" : "listo";
        return { ...base, stage: "screening", tasks: { ...base.tasks, [task]: estado } };
      }
      return { ...base, stage };
    });
  }, []);

  return { progress, onStage, reset };
}

function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    setSeconds(0);
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}

export function reloj(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function RunProgress({ progress }) {
  const seconds = useElapsed(!!progress);
  if (!progress) return null;

  const paso = Math.max(0, ETAPAS.indexOf(progress.stage));
  const esperandoModelo = progress.stage === "screening";
  const tasks = ["dgof", "iroc"].filter((t) => progress.tasks[t]);

  return (
    <div style={{ marginTop: 14, padding: "12px 14px", background: C.tint, border: `1px dashed ${C.rule}` }}
      role="status" aria-live="polite">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 9 }}>
        <Label>Cotejo en progreso</Label>
        <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.soft }}>{reloj(seconds)}</span>
      </div>

      <div className={`barra ${esperandoModelo ? "abierta" : "medida"}`}>
        <i style={esperandoModelo ? undefined : { width: `${((paso + 1) / ETAPAS.length) * 100}%` }} />
      </div>

      <div style={{ fontFamily: F.mono, fontSize: 12, color: C.ink, marginTop: 9 }}>
        {ETIQUETA_ETAPA[progress.stage] || "Trabajando"}…
      </div>

      {tasks.length > 0 && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 7, fontFamily: F.mono, fontSize: 11.5 }}>
          {tasks.map((t) => (
            <span key={t} style={{ color: progress.tasks[t] === "listo" ? C.stampBlue : C.soft }}>
              {progress.tasks[t] === "listo" ? "✓" : "▸"} {t.toUpperCase()} · {progress.tasks[t]}
            </span>
          ))}
        </div>
      )}

      {esperandoModelo && seconds > 45 && (
        <p style={{ fontSize: 12.5, color: C.soft, margin: "9px 0 0", lineHeight: 1.5 }}>
          Los modelos locales grandes pueden tardar varios minutos en una propuesta larga.
        </p>
      )}
    </div>
  );
}

export function Intake({ text, setText, file, setFile, onRun, busy, ready, runLabel, err, note, progress }) {
  const fileRef = useRef(null);

  async function readFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type === "application/pdf") {
      setText("");
    } else {
      setText(await f.text());
    }
  }

  return (
    <Card title="Radicación de la propuesta" eyebrow="Paso 01">
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setFile(null); }}
        placeholder="Pega aquí el texto de la propuesta — resumen, aims específicos, métodos, personal clave y sitios de estudio."
        style={{
          width: "100%", minHeight: 150, padding: 12, fontFamily: F.body, fontSize: 14.5,
          lineHeight: 1.6, border: `1px solid ${C.rule}`, background: "#fff", resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Adjuntar PDF</button>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md" onChange={readFile} style={{ display: "none" }} />
        {file && <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.soft }}>{file.name}</span>}
        <span style={{ flex: 1 }} />
        <button className={`btn${busy ? " corriendo" : ""}`} onClick={onRun} disabled={!ready} aria-busy={busy}>
          {busy ? <><span className="hilandero" />Evaluando…</> : runLabel}
        </button>
      </div>
      {/* El panel aparece con el clic, no con el primer evento: el hueco inicial
          es justo el momento en que el botón se sentía muerto. DEI no pasa
          `progress` — corre local y no tiene etapas que informar. */}
      {busy && progress !== undefined && (
        <RunProgress progress={progress || { stage: "received", tasks: {} }} />
      )}
      {note && (
        <p style={{ fontSize: 13, color: C.soft, marginTop: 12, marginBottom: 0, lineHeight: 1.55 }}>{note}</p>
      )}
      {err && (
        <p style={{ color: C.stampRed, fontSize: 14, marginTop: 12, marginBottom: 0 }}>{err}</p>
      )}
    </Card>
  );
}

export function AskPi({ items }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.rule}` }}>
      <Label>Verificar con el PI</Label>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
        {items.map((q, i) => <li key={i}>{q}</li>)}
      </ul>
    </div>
  );
}

export function EmailDraft({ body }) {
  return (
    <Card title="Borrador de correo" eyebrow="Paso 04">
      <pre style={{
        fontFamily: F.mono, fontSize: 12.5, lineHeight: 1.7, whiteSpace: "pre-wrap",
        background: "#fff", border: `1px solid ${C.rule}`, padding: 14, margin: 0, maxHeight: 320, overflow: "auto",
      }}>{body}</pre>
      <button className="btn btn-ghost" style={{ marginTop: 12 }}
        onClick={() => navigator.clipboard?.writeText(body)}>Copiar</button>
    </Card>
  );
}

/* Portón de firma: el sistema nunca certifica solo. */
export function SignOff({ verdict, signer, setSigner, signed, onSign, saved, caseNo, certLabel }) {
  return (
    <div style={{ marginTop: 16, padding: 16, background: C.tint, border: `1px dashed ${C.rule}` }}>
      <Label>Certificación</Label>
      <p style={{ fontSize: 14, lineHeight: 1.6, margin: "8px 0 12px" }}>
        El cotejo automatizado no certifica. La certificación la hace el ICDGOF bajo su firma,
        con las consecuencias legales que conlleva.
      </p>
      {verdict === "clear" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input value={signer} onChange={(e) => setSigner(e.target.value)}
            placeholder="Nombre del ICDGOF"
            style={{ padding: "9px 11px", border: `1px solid ${C.rule}`, fontFamily: F.body, fontSize: 14, flex: "1 1 200px" }} />
          <button className="btn" disabled={!signer.trim() || signed} onClick={onSign}>
            {signed ? "Certificado" : "Firmar certificación"}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: C.soft, margin: 0, fontStyle: "italic" }}>
          No disponible: el expediente requiere revisión antes de certificarse.
        </p>
      )}
      {signed && (
        <p style={{ fontFamily: F.mono, fontSize: 12, marginTop: 12, marginBottom: 0, color: C.stampBlue }}>
          Certificado {certLabel} emitido por {signer} · {new Date().toLocaleString("es-PR")} · {caseNo}
          {saved === true && " · guardado en el expediente local"}
          {saved === false && " · aviso: no se pudo guardar en el expediente local"}
        </p>
      )}
      {saved === false && !signed && (
        <p style={{ fontFamily: F.mono, fontSize: 12, marginTop: 12, marginBottom: 0, color: C.stampRed }}>
          No se pudo guardar la certificación. Inténtalo nuevamente.
        </p>
      )}
    </div>
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

function evaluationForm({ file, text, model, tasks, caseNo }) {
  const form = new FormData();
  if (file && file.type === "application/pdf") form.append("file", file);
  else form.append("text", text);
  form.append("model", model);
  form.append("tasks", tasks.join(","));
  if (caseNo) form.append("caseNo", caseNo);
  return form;
}

export async function runEvaluation(params) {
  const r = await fetch("/api/evaluate", {
    method: "POST", headers: csrfHeaders(), body: evaluationForm(params),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Error del servidor");
  return data;
}

/* Un bloque SSE: `event: <nombre>` + una o más líneas `data:`. Los latidos
   del servidor empiezan con `:` y se caen solos al no traer nombre. */
function parseSse(block) {
  let name = null;
  let data = "";
  for (const raw of block.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("event: ")) name = line.slice(7);
    else if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!name || !data) return null;
  try {
    return { name, data: JSON.parse(data) };
  } catch {
    return null;
  }
}

/* Mismo cotejo que runEvaluation, informando cada etapa por `onStage`.
   Si el servidor no tiene la ruta en streaming, cae a la de siempre: el
   cotejo corre igual, solo sin señal de progreso. */
export async function runEvaluationStream(params, onStage) {
  let response;
  try {
    response = await fetch("/api/evaluate/stream", {
      method: "POST", headers: csrfHeaders(), body: evaluationForm(params),
    });
  } catch {
    return runEvaluation(params);
  }
  if (response.status === 404 || !response.body) return runEvaluation(params);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Error del servidor");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let failure = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const event = parseSse(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
      if (!event) continue;
      if (event.name === "stage") onStage?.(event.data);
      else if (event.name === "done") result = event.data;
      else if (event.name === "error") failure = event.data.error;
    }
  }

  // El stream ya mandó 200 al abrirse: un fallo llega como evento, no como estado.
  if (failure) throw new Error(failure);
  if (!result) throw new Error("La evaluación se interrumpió antes de completarse.");
  return result;
}

export async function extractText(file, caseNo) {
  const form = new FormData();
  form.append("file", file);
  if (caseNo) form.append("caseNo", caseNo);
  const r = await fetch("/api/extract", { method: "POST", headers: csrfHeaders(), body: form });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "No se pudo extraer el texto del documento.");
  return data;
}

export async function reserveCaseNumber(existingCaseNo) {
  if (existingCaseNo) return existingCaseNo;
  const r = await fetch("/api/case-number");
  const data = await r.json();
  return data.caseNo;
}

export async function saveCase(payload) {
  const r = await fetch("/api/cases", {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("No se pudo guardar el expediente");
  return r.json();
}

export function useHighlight(text, dei) {
  return useMemo(() => {
    if (!text.trim() || !dei || !Object.keys(dei.hits).length) return null;
    const found = Object.keys(dei.hits)
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`\\b(${found.join("|")})\\b`, "gi");
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) && i % 2 === 1
        ? <mark key={i} style={{ background: C.marca, color: C.ink, padding: "0 1px" }}>{p}</mark>
        : <span key={i}>{p}</span>
    );
  }, [text, dei]);
}

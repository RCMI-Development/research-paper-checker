import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { DeiPage } from "./dei.jsx";
import { DgofPage } from "./dgof.jsx";
import { IrocPage } from "./iroc.jsx";

/* Prototipo B: los tres cotejos viven en esta misma página. No hay
   ventanas emergentes ni iframes — cada cotejo es un componente que se
   monta dentro de la sobrecapa y se mantiene montado al cambiar de
   pestaña, para que no se pierda el trabajo a medio hacer. */

const COTEJOS = [
  {
    key: "dei", label: "DEI", num: "COTEJO 01", accent: "var(--amber)", Page: DeiPage,
    blurb: "Cuenta y resalta términos de diversidad, equidad e inclusión en el documento. Determinista: el mismo texto siempre da el mismo resultado.",
    meta: "Local · no usa modelo · instantáneo",
  },
  {
    key: "dgof", label: "DGOF", num: "COTEJO 02", accent: "var(--red)", Page: DgofPage,
    blurb: "Evalúa la propuesta contra los siete resultados de ganancia de función peligrosa y emite determinación con evidencia del texto.",
    meta: "Requiere LM Studio · emite certificado",
  },
  {
    key: "iroc", label: "IROC", num: "COTEJO 03", accent: "var(--blue)", Page: IrocPage,
    blurb: "Identifica sitios fuera de EE. UU., personal clave con afiliación extranjera y posibles entidades de preocupación.",
    meta: "Requiere LM Studio · emite certificado",
  },
];

function useHealth() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth({ down: true }));
  }, []);
  if (!health) return { cls: "dot", text: "Conectando a LM Studio…" };
  if (health.down) return { cls: "dot off", text: "No se pudo contactar el servidor local — ¿corriste npm run dev?" };
  if (health.reachable) return { cls: "dot on", text: `LM Studio en línea (localhost:1234) · modelo: ${health.defaultModel}` };
  return { cls: "dot off", text: "LM Studio no disponible — préndelo en Developer › Local Server. El cotejo DEI funciona igual." };
}

function Panel({ keys, caseNo, onClose }) {
  const [active, setActive] = useState(keys[0]);
  const [resets, setResets] = useState({});
  const closeRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();
    document.body.classList.add("locked");
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("locked");
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  const reset = useCallback((key) => {
    setResets((r) => ({ ...r, [key]: (r[key] || 0) + 1 }));
  }, []);

  return (
    <div className="backdrop open" role="dialog" aria-modal="true" aria-label="Cotejo"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel">
        <div className="panelbar" role="tablist">
          {keys.length > 1 && keys.map((key) => {
            const c = COTEJOS.find((x) => x.key === key);
            return (
              <button key={key} className="tab" type="button" role="tab"
                aria-selected={active === key} style={{ "--accent": c.accent }}
                onClick={() => setActive(key)}>{c.label}</button>
            );
          })}
          <span className="caseno">{caseNo || ""}</span>
          <button className="close" ref={closeRef} aria-label="Cerrar cotejo" onClick={onClose}>✕</button>
        </div>
        <div className="frames">
          {keys.map((key) => {
            const { Page } = COTEJOS.find((x) => x.key === key);
            return (
              <div key={key} className={active === key ? "active" : ""}>
                <Page key={resets[key] || 0} embedded caseNo={caseNo}
                  onClose={onClose} onReset={() => reset(key)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Index() {
  const status = useHealth();
  const [panel, setPanel] = useState(null);

  async function openAll() {
    const r = await fetch("/api/case-number");
    if (!r.ok) return;
    const { caseNo } = await r.json();
    setPanel({ keys: COTEJOS.map((c) => c.key), caseNo });
  }

  return (
    <>
      <div className="wrap">
        <header>
          <div className="eyebrow">Recinto de Ciencias Médicas · Decanato de Investigación</div>
          <h1>Expediente de cumplimiento</h1>
          <p className="blurb">
            Cotejo preliminar de propuestas conforme a la política federal de julio de 2026 (EO&nbsp;14292).
            Cada cotejo abre sobre esta misma página. El resultado es un documento de trabajo:
            la certificación la firma una persona.
          </p>
          <div className="status">
            <span className={status.cls} />
            <span>{status.text}</span>
          </div>
        </header>

        <div className="grid">
          {COTEJOS.map((c) => (
            <button key={c.key} className="tile" style={{ "--accent": c.accent }}
              onClick={() => setPanel({ keys: [c.key], caseNo: null })}>
              <span className="num">{c.num}</span>
              <h2>{c.label}</h2>
              <p>{c.blurb}</p>
              <div className="meta">{c.meta}</div>
              <span className="cta">Abrir cotejo →</span>
            </button>
          ))}
        </div>

        <div className="row">
          <button className="btn" onClick={openAll}>Abrir los tres a la vez</button>
        </div>

        <p className="note">
          Prototipo. El cotejo automatizado es una ayuda de triaje: reduce el trabajo de lectura, no
          sustituye la atestación del PI ni la certificación del ICDGOF, ambas bajo pena de ley.
          Ninguna determinación de este sistema debe adjuntarse a una propuesta como evidencia de
          cumplimiento. Todo corre en esta computadora — nada del texto de la propuesta sale de aquí.
        </p>
      </div>

      {panel && (
        <Panel keys={panel.keys} caseNo={panel.caseNo} onClose={() => setPanel(null)} />
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(
  <React.StrictMode><Index /></React.StrictMode>
);

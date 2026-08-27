import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { COTEJOS, Panel } from "./panel.jsx";

/* Prototipo B: los tres cotejos viven en esta misma página. La sobrecapa
   es la misma que usa la página del Decanato (src/panel.jsx); aquí solo
   cambia el índice que la lanza. */

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

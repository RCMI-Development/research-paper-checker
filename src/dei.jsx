import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import {
  C, F, DEFAULT_DEI_TERMS, Shell, Card, Label, Intake,
  scanDei, useHighlight, extractText, reserveCaseNumber, saveCase,
  initialCaseNumber,
} from "./shared.jsx";

/* Cotejo DEI — corre enteramente en el navegador. No usa LM Studio:
   es un conteo determinista de términos, auditable y repetible. */

export function DeiPage({ embedded, onClose, onReset, caseNo: initialCaseNo }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [terms, setTerms] = useState(DEFAULT_DEI_TERMS.join(", "));
  const [showTerms, setShowTerms] = useState(false);
  const [caseNo, setCaseNo] = useState(() => initialCaseNo || initialCaseNumber());
  const [ran, setRan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(null);

  const termList = useMemo(
    () => terms.split(",").map((t) => t.trim()).filter(Boolean),
    [terms]
  );

  const dei = useMemo(() => (ran ? scanDei(text, termList) : null), [ran, text, termList]);
  const highlighted = useHighlight(text, dei);

  async function run() {
    setErr(""); setBusy(true); setSaved(null);
    try {
      let body = text;
      let no;
      if (file && file.type === "application/pdf") {
        const data = await extractText(file, caseNo);
        body = data.text;
        no = data.caseNo;
        setText(body);
      } else {
        no = await reserveCaseNumber(caseNo);
      }
      setCaseNo(no);
      setRan(true);
    } catch (e) {
      setErr(e.message || "No se pudo completar el cotejo.");
    } finally {
      setBusy(false);
    }
  }

  async function guardar() {
    try {
      await saveCase({
        caseNo,
        fileName: file?.name || null,
        proposalExcerpt: text.slice(0, 4000),
        dei,
        verdict: "informativo",
        model: "cotejo local (sin modelo)",
      });
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }

  const ready = (text.trim().length > 40 || file) && !busy;

  return (
    <Shell
      tag="DEI"
      embedded={embedded} onClose={onClose} onReset={onReset}
      title="Cotejo DEI"
      caseNo={caseNo}
      blurb="Conteo y resaltado de términos de diversidad, equidad e inclusión en el texto de la propuesta. Corre localmente en el navegador, sin modelo de lenguaje: el mismo documento siempre da el mismo resultado."
    >
      <Intake
        text={text} setText={setText}
        file={file} setFile={setFile}
        onRun={run} busy={busy} ready={ready}
        runLabel="Iniciar cotejo DEI"
        err={err}
        note="Este cotejo no requiere LM Studio."
      />

      {dei && (
        <Card title="Informe DEI" eyebrow="Paso 02 · cotejo local, sin modelo"
          accent={dei.total ? C.stampAmber : C.stampBlue}>
          <div style={{ display: "flex", gap: 34, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 32, lineHeight: 1 }}>{dei.total}</div>
              <Label>Coincidencias</Label>
            </div>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 32, lineHeight: 1 }}>{Object.keys(dei.hits).length}</div>
              <Label>Términos distintos</Label>
            </div>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 32, lineHeight: 1 }}>{dei.density.toFixed(1)}</div>
              <Label>Por mil palabras</Label>
            </div>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 32, lineHeight: 1 }}>{dei.words}</div>
              <Label>Palabras</Label>
            </div>
          </div>

          {!!Object.keys(dei.hits).length && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {Object.entries(dei.hits).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <span key={t} style={{
                  fontFamily: F.mono, fontSize: 11.5, border: `1px solid ${C.rule}`,
                  padding: "3px 8px", background: C.tint,
                }}>{t} <b>{n}</b></span>
              ))}
            </div>
          )}

          {!Object.keys(dei.hits).length && (
            <p style={{ fontSize: 14, color: C.soft, fontStyle: "italic", margin: "0 0 12px" }}>
              No se encontró ninguno de los términos de la lista en el documento.
            </p>
          )}

          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}
            onClick={() => setShowTerms(!showTerms)}>
            {showTerms ? "Ocultar lista" : "Editar lista de términos"}
          </button>
          {showTerms && (
            <textarea value={terms} onChange={(e) => setTerms(e.target.value)}
              style={{
                width: "100%", minHeight: 80, marginTop: 10, padding: 10,
                fontFamily: F.mono, fontSize: 12, border: `1px solid ${C.rule}`,
              }} />
          )}

          {highlighted && (
            <details style={{ marginTop: 14 }}>
              <summary style={{
                fontFamily: F.display, fontSize: 14, letterSpacing: ".08em",
                textTransform: "uppercase", cursor: "pointer", color: C.soft,
              }}>Ver texto resaltado</summary>
              <div style={{
                marginTop: 10, padding: 14, background: "#fff", border: `1px solid ${C.rule}`,
                maxHeight: 280, overflow: "auto", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap",
              }}>{highlighted}</div>
            </details>
          )}

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px dashed ${C.rule}` }}>
            <p style={{ fontSize: 13.5, color: C.soft, lineHeight: 1.6, margin: "0 0 10px" }}>
              El informe DEI es descriptivo: cuenta y ubica términos. No emite determinación de
              cumplimiento ni certificado — eso corresponde a los cotejos DGOF e IROC.
            </p>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }}
              onClick={guardar} disabled={saved === true}>
              {saved === true ? "Guardado en el expediente" : "Guardar en el expediente"}
            </button>
            {saved === false && (
              <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.stampRed, marginLeft: 10 }}>
                No se pudo guardar
              </span>
            )}
          </div>
        </Card>
      )}
    </Shell>
  );
}

/* Página independiente: solo monta cuando se sirve como su propio HTML.
   Importada desde el índice, el componente se renderiza en la sobrecapa. */
const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<React.StrictMode><DeiPage /></React.StrictMode>);
}

import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import {
  C, F, DGOF_OUTCOMES, Shell, Card, Label, Intake, Stamp, AskPi, EmailDraft, SignOff,
  ModelBar, useLmStudio, severityOf, runEvaluationStream, saveCase, useRunProgress,
  initialCaseNumber,
} from "./shared.jsx";

/* Cotejo DGOF — evalúa la propuesta contra los siete resultados de
   ganancia de función bajo la política federal de julio de 2026. */

export function DgofPage({ embedded, onClose, onReset, caseNo: initialCaseNo }) {
  const { health, models, model, setModel } = useLmStudio();
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const { progress, onStage, reset: resetProgress } = useRunProgress();
  const [err, setErr] = useState("");
  const [dgof, setDgof] = useState(null);
  const [caseNo, setCaseNo] = useState(() => initialCaseNo || initialCaseNumber());
  const [screeningIds, setScreeningIds] = useState({});
  const [signer, setSigner] = useState("");
  const [signed, setSigned] = useState(false);
  const [saved, setSaved] = useState(null);

  const verdict = useMemo(
    () => (dgof ? severityOf("dgof", dgof.determination) : null),
    [dgof]
  );

  async function run() {
    setErr(""); setBusy(true); setDgof(null); setSigned(false); setSaved(null);
    try {
      const data = await runEvaluationStream({ file, text, model, tasks: ["dgof"], caseNo }, onStage);
      setCaseNo(data.caseNo);
      setScreeningIds(data.screeningIds || {});
      setDgof(data.dgof);
      if (data.proposalExcerpt && !text.trim()) setText(data.proposalExcerpt);
    } catch (e) {
      setErr(e.message || "La evaluación no se completó. Revisa el documento e inténtalo otra vez.");
    } finally {
      setBusy(false);
      resetProgress();
    }
  }

  async function onSign() {
    setSaved(null);
    try {
      await saveCase({
        caseNo, fileName: file?.name || null,
        proposalExcerpt: text.slice(0, 4000),
        dgof, verdict, model, signer, screeningIds,
      });
      setSigned(true);
      setSaved(true);
    } catch {
      setSigned(false);
      setSaved(false);
    }
  }

  const email = useMemo(() => {
    if (!verdict || !caseNo) return "";
    const to = verdict === "clear"
      ? "Para: [PI]  ·  CC: Dra. Segarra, Sr. Camacho"
      : "Para: IRE / ICDGOF  ·  CC: [PI], Dra. Segarra, Sr. Camacho";
    const head = verdict === "clear"
      ? `Cotejo DGOF completado — ${caseNo}`
      : `Propuesta referida a revisión institucional (DGOF) — ${caseNo}`;
    const body = verdict === "clear"
      ? `El cotejo preliminar DGOF de la propuesta ${caseNo} no identificó hallazgos.\n\nSe adjunta el informe DGOF. El certificado de cumplimiento queda pendiente de la firma del ICDGOF y no es válido hasta ese momento.\n\nUna vez certificado, la propuesta pasa al Decanato de Investigación para su aval.`
      : `El cotejo preliminar DGOF de la propuesta ${caseNo} identificó asuntos que requieren revisión del Institutional Review Entity (IRE).\n\nMotivo: ${dgof?.rationale || ""}\n\nSe adjunta el informe DGOF. No se emite certificado hasta que el IRE complete su análisis de riesgo-beneficio con el PI.`;
    return `${to}\nAsunto: ${head}\n\n${body}\n\n—\nGenerado por cotejo automatizado (modelo local: ${model}). Documento de trabajo; no constituye certificación.`;
  }, [verdict, caseNo, dgof, model]);

  const ready = (text.trim().length > 40 || file) && !busy && health?.reachable;

  return (
    <Shell
      tag="DGOF"
      embedded={embedded} onClose={onClose} onReset={onReset}
      title="Cotejo DGOF"
      caseNo={caseNo}
      blurb="Evaluación de investigación peligrosa de ganancia de función conforme a la política federal de julio de 2026 (EO 14292). Corre contra un modelo local servido por LM Studio."
      bar={<ModelBar health={health} models={models} model={model} setModel={setModel} />}
    >
      <Intake
        text={text} setText={setText}
        file={file} setFile={setFile}
        onRun={run} busy={busy} ready={ready} progress={progress}
        runLabel="Iniciar cotejo DGOF"
        err={err}
        note={health && !health.reachable ? "Requiere LM Studio prendido en Developer › Local Server." : null}
      />

      {dgof && (
        <Card title="Informe DGOF" eyebrow="Paso 02"
          accent={dgof.determination === "none" ? C.stampBlue : dgof.determination === "likely" ? C.stampRed : C.stampAmber}>
          <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 0 }}>{dgof.rationale}</p>
          <div style={{ fontFamily: F.mono, fontSize: 12, color: C.soft, marginBottom: 12 }}>
            Determinación: <b style={{ color: C.ink }}>{dgof.determination}</b>
            {dgof.in_silico_only && " · trabajo in silico"}
            {!!dgof.agents?.length && ` · agentes: ${dgof.agents.join(", ")}`}
          </div>
          {dgof.outcomes?.length ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <tbody>
                {dgof.outcomes.map((o, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.rule}` }}>
                    <td style={{ padding: "9px 8px 9px 0", fontFamily: F.mono, verticalAlign: "top", width: 26 }}>{o.n}</td>
                    <td style={{ padding: "9px 0", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 600 }}>{DGOF_OUTCOMES[o.n - 1]}</div>
                      {o.evidence && <div style={{ fontStyle: "italic", color: C.soft, marginTop: 3 }}>"{o.evidence}"</div>}
                      {o.note && <div style={{ marginTop: 3, lineHeight: 1.5 }}>{o.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: 14, color: C.soft, fontStyle: "italic", margin: 0 }}>
              No se identificó ninguno de los siete resultados en el texto.
            </p>
          )}
          <AskPi items={dgof.ask_pi} />
        </Card>
      )}

      {verdict && (
        <Card title="Encaminamiento" eyebrow="Paso 03"
          accent={verdict === "clear" ? C.stampBlue : verdict === "stop" ? C.stampRed : C.stampAmber}>
          <div style={{ padding: "6px 0 20px" }}><Stamp verdict={verdict} caseNo={caseNo} /></div>
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>
            {verdict === "clear" && "El informe DGOF se envía al PI con copia a Dra. Segarra y Sr. Camacho. El certificado DGOF se emite al firmar el ICDGOF."}
            {verdict === "review" && "La propuesta se refiere al Institutional Review Entity (IRE). El IRE y el PI completan el análisis inicial de riesgo-beneficio y lo comunican a la agencia federal. No se emite certificado en esta etapa."}
            {verdict === "stop" && "El cotejo señala trabajo que podría estar prohibido. La propuesta se detiene, se notifica al ICDGOF y al IRE, y no continúa hasta que una persona resuelva el hallazgo. Si se confirma DGOF en trabajo activo, la notificación a la agencia federal ocurre dentro de 24 horas."}
            {verdict === "unknown" && "El documento no contiene información suficiente para determinar. Solicitar al PI los detalles señalados en el informe antes de continuar."}
          </p>
          <SignOff
            verdict={verdict} signer={signer} setSigner={setSigner}
            signed={signed} onSign={onSign} saved={saved} caseNo={caseNo} certLabel="DGOF"
          />
        </Card>
      )}

      {verdict && <EmailDraft body={email} />}
    </Shell>
  );
}

/* Página independiente: solo monta cuando se sirve como su propio HTML.
   Importada desde el índice, el componente se renderiza en la sobrecapa. */
const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<React.StrictMode><DgofPage /></React.StrictMode>);
}

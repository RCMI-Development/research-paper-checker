import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import {
  C, F, Shell, Card, Label, Intake, Stamp, AskPi, EmailDraft, SignOff,
  ModelBar, useLmStudio, severityOf, runEvaluationStream, saveCase, useRunProgress,
  initialCaseNumber,
} from "./shared.jsx";

/* Cotejo IROC — investigación internacional de preocupación: sitios
   fuera de EE. UU., colaboradores extranjeros y entidades de preocupación. */

export function IrocPage({ embedded, onClose, onReset, caseNo: initialCaseNo }) {
  const { health, models, model, setModel } = useLmStudio();
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const { progress, onStage, reset: resetProgress } = useRunProgress();
  const [err, setErr] = useState("");
  const [iroc, setIroc] = useState(null);
  const [caseNo, setCaseNo] = useState(() => initialCaseNo || initialCaseNumber());
  const [screeningIds, setScreeningIds] = useState({});
  const [signer, setSigner] = useState("");
  const [signed, setSigned] = useState(false);
  const [saved, setSaved] = useState(null);

  const verdict = useMemo(
    () => (iroc ? severityOf("iroc", iroc.determination) : null),
    [iroc]
  );

  async function run() {
    setErr(""); setBusy(true); setIroc(null); setSigned(false); setSaved(null);
    try {
      const data = await runEvaluationStream({ file, text, model, tasks: ["iroc"], caseNo }, onStage);
      setCaseNo(data.caseNo);
      setScreeningIds(data.screeningIds || {});
      setIroc(data.iroc);
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
        iroc, verdict, model, signer, screeningIds,
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
      ? `Cotejo IROC completado — ${caseNo}`
      : `Propuesta referida a revisión institucional (IROC) — ${caseNo}`;
    const body = verdict === "clear"
      ? `El cotejo preliminar IROC de la propuesta ${caseNo} no identificó hallazgos.\n\nSe adjunta el informe IROC. El certificado de cumplimiento queda pendiente de la firma del ICDGOF y no es válido hasta ese momento.\n\nUna vez certificado, la propuesta pasa al Decanato de Investigación para su aval.`
      : `El cotejo preliminar IROC de la propuesta ${caseNo} identificó asuntos que requieren revisión del Institutional Review Entity (IRE).\n\nMotivo: ${iroc?.rationale || ""}\n\nSe adjunta el informe IROC. No se emite certificado hasta que el IRE complete su análisis de riesgo-beneficio con el PI.`;
    return `${to}\nAsunto: ${head}\n\n${body}\n\n—\nGenerado por cotejo automatizado (modelo local: ${model}). Documento de trabajo; no constituye certificación.`;
  }, [verdict, caseNo, iroc, model]);

  const ready = (text.trim().length > 40 || file) && !busy && health?.reachable;

  return (
    <Shell
      tag="IROC"
      embedded={embedded} onClose={onClose} onReset={onReset}
      title="Cotejo IROC"
      caseNo={caseNo}
      blurb="Evaluación de investigación internacional de preocupación: sitios fuera de EE. UU., personal clave con afiliación extranjera y entidades de preocupación. Corre contra un modelo local servido por LM Studio."
      bar={<ModelBar health={health} models={models} model={model} setModel={setModel} />}
    >
      <Intake
        text={text} setText={setText}
        file={file} setFile={setFile}
        onRun={run} busy={busy} ready={ready} progress={progress}
        runLabel="Iniciar cotejo IROC"
        err={err}
        note={health && !health.reachable ? "Requiere LM Studio prendido en Developer › Local Server." : null}
      />

      {iroc && (
        <Card title="Informe IROC" eyebrow="Paso 02"
          accent={iroc.determination === "none" ? C.stampBlue : iroc.determination === "prohibited_risk" ? C.stampRed : C.stampAmber}>
          <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 0 }}>{iroc.rationale}</p>
          <div style={{ fontFamily: F.mono, fontSize: 12, color: C.soft, marginBottom: 12 }}>
            Determinación: <b style={{ color: C.ink }}>{iroc.determination}</b>
          </div>

          {!!iroc.foreign_sites?.length && (
            <>
              <Label>Sitios fuera de EE. UU.</Label>
              <ul style={{ margin: "8px 0 14px", paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
                {iroc.foreign_sites.map((s, i) => (
                  <li key={i}><b>{s.country}</b> — {s.entity} <span style={{ color: C.soft }}>({s.role})</span></li>
                ))}
              </ul>
            </>
          )}

          {!!iroc.collaborators?.length && (
            <>
              <Label>Personal clave con afiliación extranjera</Label>
              <ul style={{ margin: "8px 0 14px", paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
                {iroc.collaborators.map((c, i) => (
                  <li key={i}>{c.name} — {c.affiliation} <span style={{ color: C.soft }}>({c.country})</span></li>
                ))}
              </ul>
            </>
          )}

          {!iroc.foreign_sites?.length && !iroc.collaborators?.length && (
            <p style={{ fontSize: 14, color: C.soft, fontStyle: "italic", margin: 0 }}>
              No se identificaron sitios ni colaboradores fuera de Estados Unidos.
            </p>
          )}

          <AskPi items={iroc.ask_pi} />

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.rule}`, fontSize: 13.5, color: C.soft, lineHeight: 1.6 }}>
            El cotejo no incluye la lista oficial de entidades de preocupación, aún no publicada.
            Toda afiliación extranjera se verifica manualmente contra esa lista cuando salga.
          </div>
        </Card>
      )}

      {verdict && (
        <Card title="Encaminamiento" eyebrow="Paso 03"
          accent={verdict === "clear" ? C.stampBlue : verdict === "stop" ? C.stampRed : C.stampAmber}>
          <div style={{ padding: "6px 0 20px" }}><Stamp verdict={verdict} caseNo={caseNo} /></div>
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>
            {verdict === "clear" && "El informe IROC se envía al PI con copia a Dra. Segarra y Sr. Camacho. El certificado IROC se emite al firmar el ICDGOF."}
            {verdict === "review" && "La propuesta se refiere al Institutional Review Entity (IRE) para evaluación de riesgo del componente internacional. No se emite certificado en esta etapa."}
            {verdict === "stop" && "El cotejo señala investigación que podría estar prohibida por involucrar un país o entidad de preocupación. La propuesta se detiene y se notifica al ICDGOF y al IRE."}
            {verdict === "unknown" && "El documento no contiene información suficiente para determinar. Solicitar al PI los detalles señalados en el informe antes de continuar."}
          </p>
          <SignOff
            verdict={verdict} signer={signer} setSigner={setSigner}
            signed={signed} onSign={onSign} saved={saved} caseNo={caseNo} certLabel="IROC"
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
  ReactDOM.createRoot(rootEl).render(<React.StrictMode><IrocPage /></React.StrictMode>);
}

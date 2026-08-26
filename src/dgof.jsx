import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import {
  C, DGOF_OUTCOMES, Shell, Intake, Resultado, DatosCertificado, Certificado,
  ModelBar, useLmStudio, severityOf, runEvaluation, saveCase,
} from "./shared.jsx";

/* Cotejo DGOF — evalúa la propuesta contra los siete resultados de
   ganancia de función bajo la política federal de julio de 2026. */

function DgofPage() {
  const health = useLmStudio();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dgof, setDgof] = useState(null);
  const [caseNo, setCaseNo] = useState(null);
  const [piName, setPiName] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [emitido, setEmitido] = useState(false);
  const [guardado, setGuardado] = useState(null);

  const verdict = useMemo(
    () => (dgof ? severityOf("dgof", dgof.determination) : null),
    [dgof]
  );

  async function run() {
    setErr(""); setBusy(true); setDgof(null); setCaseNo(null);
    setEmitido(false); setGuardado(null);
    try {
      const data = await runEvaluation({ file, tasks: ["dgof"] });
      setCaseNo(data.caseNo);
      setDgof(data.dgof);
    } catch (e) {
      setErr(e.message || "La evaluación no se completó. Revisa el documento e inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  async function emitir() {
    setEmitido(true);
    try {
      await saveCase({
        caseNo, fileName: file?.name || null,
        piName, proposalTitle,
        dgof, verdict, model: "openai/gpt-oss-20b",
        signer: piName,
      });
      setGuardado(true);
    } catch {
      setGuardado(false);
    }
  }

  /* Una oración: encontró o no encontró. */
  const oracion = !dgof ? "" :
    verdict === "clear"
      ? "No se encontraron infracciones DGOF en la propuesta."
      : verdict === "unknown"
        ? "El documento no contiene información suficiente para determinar si hay infracciones DGOF."
        : "Se encontraron infracciones DGOF en la propuesta.";

  /* Conceptos que no cumplen, con la cita del texto donde aparecen. */
  const findings = useMemo(() => {
    if (!dgof) return [];
    const lista = (dgof.outcomes || []).map((o) => ({
      concepto: DGOF_OUTCOMES[o.n - 1] || `Resultado ${o.n}`,
      evidencia: o.evidence,
      nota: o.note,
    }));
    if (!lista.length && dgof.rationale) {
      lista.push({ concepto: "Observación del cotejo", nota: dgof.rationale });
    }
    return lista;
  }, [dgof]);

  const ready = file && !busy && health?.reachable;
  const paso3 = verdict === "clear";

  return (
    <Shell
      tag="DGOF"
      title="Cotejo DGOF"
      caseNo={caseNo}
      blurb="Evaluación de investigación peligrosa de ganancia de función conforme a la política federal de julio de 2026 (EO 14292)."
      bar={<ModelBar health={health} />}
    >
      <Intake
        file={file} setFile={setFile}
        onRun={run} busy={busy} ready={ready}
        runLabel="Iniciar cotejo DGOF"
        err={err}
        note={health && !health.reachable ? "Requiere LM Studio prendido en Developer › Local Server." : null}
      />

      {dgof && (
        <Resultado
          paso="Paso 02"
          titulo="Resultado DGOF"
          oracion={oracion}
          verdict={verdict}
          caseNo={caseNo}
          findings={findings}
          accent={verdict === "clear" ? C.stampBlue : verdict === "stop" ? C.stampRed : C.stampAmber}
        />
      )}

      {paso3 && (
        <DatosCertificado
          piName={piName} setPiName={setPiName}
          proposalTitle={proposalTitle} setProposalTitle={setProposalTitle}
          onEmitir={emitir} emitido={emitido}
        />
      )}

      {paso3 && emitido && (
        <Certificado
          cotejo="DGOF"
          descripcion="fue evaluada mediante cotejo automatizado contra los siete resultados de investigación peligrosa de ganancia de función definidos en la USG Policy for Stopping High-Risk Life Sciences Research (julio de 2026), sin que se identificaran hallazgos."
          piName={piName} proposalTitle={proposalTitle}
          caseNo={caseNo} guardado={guardado}
        />
      )}
    </Shell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><DgofPage /></React.StrictMode>
);

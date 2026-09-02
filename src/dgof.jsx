import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import {
  C, DGOF_OUTCOMES, Shell, Intake, Resultado, DatosCertificado, Certificado, InformeHallazgos,
  ModelBar, useModelProvider, severityOf, runEvaluation, saveCase,
} from "./shared.jsx";

/* Cotejo DGOF — evalúa la propuesta contra los siete resultados de
   ganancia de función bajo la política federal de julio de 2026. */

function DgofPage() {
  const health = useModelProvider();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dgof, setDgof] = useState(null);
  const [registroId, setRegistroId] = useState(null);
  const [piName, setPiName] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [emitido, setEmitido] = useState(false);
  const [guardado, setGuardado] = useState(null);
  const [model, setModel] = useState(null);

  const verdict = useMemo(
    () => (dgof ? severityOf("dgof", dgof.determination) : null),
    [dgof]
  );

  async function run() {
    setErr(""); setBusy(true); setDgof(null); setRegistroId(null);
    setEmitido(false); setGuardado(null);
    try {
      const data = await runEvaluation({ file, tasks: ["dgof"] });
      setDgof(data.dgof);
      setModel(data.model);
    } catch (e) {
      setErr(e.message || "La evaluación no se completó. Revisa el documento e inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  async function emitir() {
    setEmitido(true);
    try {
      const r = await saveCase({
        id: registroId,
        fileName: file?.name || null,
        piName, proposalTitle,
        dgof, verdict, model: model || health?.model || null,
        signer: piName,
      });
      if (r?.id) setRegistroId(r.id);
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

  const findings = dgof?.findings || [];

  const ready = file && !busy && health?.reachable && health?.loaded !== false;
  const hayHallazgos = findings.length > 0;
  const paso3 = !!verdict;

  return (
    <Shell
      tag="DGOF"
      title="Cotejo DGOF"
      blurb="Evaluación de investigación peligrosa de ganancia de función conforme a la política federal de julio de 2026 (EO 14292)."
      bar={<ModelBar health={health} />}
    >
      <Intake
        file={file} setFile={setFile}
        onRun={run} busy={busy} ready={ready}
        runLabel="Iniciar cotejo DGOF"
        err={err}
        note={health && !health.reachable ? (health.error || "El proveedor de IA configurado no está disponible.") : null}
      />

      {dgof && (
        <Resultado
          paso="Paso 02"
          titulo="Resultado DGOF"
          oracion={oracion}
          verdict={verdict}
              accent={verdict === "clear" ? C.stampBlue : verdict === "stop" ? C.stampRed : C.stampAmber}
        />
      )}

      {paso3 && (
        <DatosCertificado
          piName={piName} setPiName={setPiName}
          proposalTitle={proposalTitle} setProposalTitle={setProposalTitle}
          onEmitir={emitir} emitido={emitido} hayHallazgos={hayHallazgos}
        />
      )}

      {paso3 && emitido && hayHallazgos && (
        <InformeHallazgos
          cotejo="DGOF"
          piName={piName} proposalTitle={proposalTitle}
          findings={findings} guardado={guardado}
        />
      )}

      {paso3 && emitido && !hayHallazgos && (
        <Certificado
          cotejo="DGOF"
          descripcion="fue evaluada mediante cotejo automatizado contra los siete resultados de investigación peligrosa de ganancia de función definidos en la USG Policy for Stopping High-Risk Life Sciences Research (julio de 2026), sin que se identificaran hallazgos."
          piName={piName} proposalTitle={proposalTitle}
          guardado={guardado}
        />
      )}
    </Shell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><DgofPage /></React.StrictMode>
);

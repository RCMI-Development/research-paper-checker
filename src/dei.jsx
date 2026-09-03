import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import {
  C, Shell, Intake, Resultado, DatosCertificado, Certificado, InformeHallazgos,
  ModelBar, useModelProvider, severityOf, runEvaluation, saveCase,
} from "./shared.jsx";

/* Cotejo DEI — evalúa la propuesta contra el uso de lenguaje de diversidad,
   equidad e inclusión. Corre contra el proveedor de IA configurado, que
   también propone cómo reescribir cada oración sin el término señalado. */

function DeiPage() {
  const health = useModelProvider();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dei, setDei] = useState(null);
  const [registroId, setRegistroId] = useState(null);
  const [piName, setPiName] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [emitido, setEmitido] = useState(false);
  const [guardado, setGuardado] = useState(null);
  const [model, setModel] = useState(null);

  const verdict = useMemo(
    () => (dei ? severityOf("dei", dei.determination) : null),
    [dei]
  );

  async function run() {
    setErr(""); setBusy(true); setDei(null); setRegistroId(null);
    setEmitido(false); setGuardado(null);
    try {
      const data = await runEvaluation({ file, tasks: ["dei"] });
      setDei(data.dei);
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
        dei, verdict, model: model || health?.model || null,
        signer: piName,
      });
      if (r?.id) setRegistroId(r.id);
      setGuardado(true);
    } catch {
      setGuardado(false);
    }
  }

  const oracion = !dei ? "" :
    verdict === "clear"
      ? "No se encontró lenguaje DEI en la propuesta."
      : verdict === "unknown"
        ? "El documento no contiene información suficiente para determinar el uso de lenguaje DEI."
        : "Se encontró lenguaje DEI en la propuesta.";

  const findings = dei?.findings || [];

  const ready = file && !busy && health?.reachable && health?.loaded !== false;
  const hayHallazgos = findings.length > 0;
  const paso3 = !!verdict;

  return (
    <Shell
      tag="DEI"
      title="Cotejo DEI"
      blurb="Evaluación del uso de lenguaje de diversidad, equidad e inclusión en la propuesta, con sugerencia de reescritura para cada oración señalada."
      bar={<ModelBar health={health} />}
      health={health}
    >
      <Intake
        file={file} setFile={setFile}
        onRun={run} busy={busy} ready={ready}
        runLabel="Iniciar cotejo DEI"
        err={err}
        note={health && !health.reachable ? (health.error || "El proveedor de IA configurado no está disponible.") : null}
      />

      {dei && (
        <Resultado
          paso="Paso 02"
          titulo="Resultado DEI"
          oracion={oracion}
          verdict={verdict}
          accent={verdict === "clear" ? C.stampBlue : C.stampAmber}
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
          cotejo="DEI"
          piName={piName} proposalTitle={proposalTitle}
          findings={findings} guardado={guardado}
        />
      )}

      {paso3 && emitido && !hayHallazgos && (
        <Certificado
          cotejo="DEI"
          descripcion="fue evaluada mediante cotejo automatizado contra el uso de lenguaje de diversidad, equidad e inclusión, sin que se identificara ninguno en el texto."
          piName={piName} proposalTitle={proposalTitle}
          guardado={guardado}
        />
      )}
    </Shell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><DeiPage /></React.StrictMode>
);

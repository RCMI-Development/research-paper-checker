import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import {
  C, Shell, Intake, Resultado, DatosCertificado, Certificado, InformeHallazgos,
  ModelBar, useLmStudio, severityOf, runEvaluation, saveCase,
} from "./shared.jsx";

/* Cotejo IROC — investigación internacional de preocupación: sitios
   fuera de EE. UU., colaboradores extranjeros y entidades de preocupación. */

function IrocPage() {
  const health = useLmStudio();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [iroc, setIroc] = useState(null);
  const [registroId, setRegistroId] = useState(null);
  const [piName, setPiName] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [emitido, setEmitido] = useState(false);
  const [guardado, setGuardado] = useState(null);

  const verdict = useMemo(
    () => (iroc ? severityOf("iroc", iroc.determination) : null),
    [iroc]
  );

  async function run() {
    setErr(""); setBusy(true); setIroc(null); setRegistroId(null);
    setEmitido(false); setGuardado(null);
    try {
      const data = await runEvaluation({ file, tasks: ["iroc"] });
      setIroc(data.iroc);
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
        iroc, verdict, model: "openai/gpt-oss-20b",
        signer: piName,
      });
      if (r?.id) setRegistroId(r.id);
      setGuardado(true);
    } catch {
      setGuardado(false);
    }
  }

  const oracion = !iroc ? "" :
    verdict === "clear"
      ? "No se encontraron infracciones IROC en la propuesta."
      : verdict === "unknown"
        ? "El documento no contiene información suficiente para determinar si hay infracciones IROC."
        : "Se encontraron infracciones IROC en la propuesta.";

  const findings = iroc?.findings || [];

  const ready = file && !busy && health?.reachable;
  const hayHallazgos = findings.length > 0;
  const paso3 = !!verdict;

  const aviso = verdict && verdict !== "clear" ? (
    <div style={{
      marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.rule}`,
      fontSize: 13.5, color: C.soft, lineHeight: 1.6,
    }}>
      El cotejo no incluye la lista oficial de entidades de preocupación, aún no publicada.
      Toda afiliación extranjera se verifica manualmente contra esa lista cuando salga.
    </div>
  ) : null;

  return (
    <Shell
      tag="IROC"
      title="Cotejo IROC"
      blurb="Evaluación de investigación internacional de preocupación: sitios fuera de EE. UU., personal clave con afiliación extranjera y entidades de preocupación."
      bar={<ModelBar health={health} />}
    >
      <Intake
        file={file} setFile={setFile}
        onRun={run} busy={busy} ready={ready}
        runLabel="Iniciar cotejo IROC"
        err={err}
        note={health && !health.reachable ? "Requiere LM Studio prendido en Developer › Local Server." : null}
      />

      {iroc && (
        <Resultado
          paso="Paso 02"
          titulo="Resultado IROC"
          oracion={oracion}
          verdict={verdict}
              extra={aviso}
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
          cotejo="IROC"
          piName={piName} proposalTitle={proposalTitle}
          findings={findings} guardado={guardado}
        />
      )}

      {paso3 && emitido && !hayHallazgos && (
        <Certificado
          cotejo="IROC"
          descripcion="fue evaluada mediante cotejo automatizado para investigación internacional de preocupación conforme a la USG Policy for Stopping High-Risk Life Sciences Research (julio de 2026), sin que se identificaran sitios ni personal clave fuera de Estados Unidos."
          piName={piName} proposalTitle={proposalTitle}
          guardado={guardado}
        />
      )}
    </Shell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><IrocPage /></React.StrictMode>
);

import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import {
  C, Shell, Intake, Resultado, DatosCertificado, Certificado,
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
  const [caseNo, setCaseNo] = useState(null);
  const [piName, setPiName] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [emitido, setEmitido] = useState(false);
  const [guardado, setGuardado] = useState(null);

  const verdict = useMemo(
    () => (iroc ? severityOf("iroc", iroc.determination) : null),
    [iroc]
  );

  async function run() {
    setErr(""); setBusy(true); setIroc(null); setCaseNo(null);
    setEmitido(false); setGuardado(null);
    try {
      const data = await runEvaluation({ file, tasks: ["iroc"] });
      setCaseNo(data.caseNo);
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
      await saveCase({
        caseNo, fileName: file?.name || null,
        piName, proposalTitle,
        iroc, verdict, model: "openai/gpt-oss-20b",
        signer: piName,
      });
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

  const findings = useMemo(() => {
    if (!iroc) return [];
    const lista = [];
    (iroc.foreign_sites || []).forEach((s) => lista.push({
      concepto: `Sitio de investigación fuera de EE. UU. — ${s.entity || "entidad no nombrada"} (${s.country})`,
      evidencia: s.evidence,
      nota: s.role,
    }));
    (iroc.collaborators || []).forEach((c) => lista.push({
      concepto: `Personal clave con afiliación extranjera — ${c.name || "nombre no indicado"}`,
      evidencia: c.evidence,
      nota: [c.affiliation, c.country].filter(Boolean).join(", "),
    }));
    if (!lista.length && iroc.rationale) {
      lista.push({ concepto: "Observación del cotejo", nota: iroc.rationale });
    }
    return lista;
  }, [iroc]);

  const ready = file && !busy && health?.reachable;
  const paso3 = verdict === "clear";

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
      caseNo={caseNo}
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
          caseNo={caseNo}
          findings={findings}
          extra={aviso}
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
          cotejo="IROC"
          descripcion="fue evaluada mediante cotejo automatizado para investigación internacional de preocupación conforme a la USG Policy for Stopping High-Risk Life Sciences Research (julio de 2026), sin que se identificaran sitios ni personal clave fuera de Estados Unidos."
          piName={piName} proposalTitle={proposalTitle}
          caseNo={caseNo} guardado={guardado}
        />
      )}
    </Shell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><IrocPage /></React.StrictMode>
);

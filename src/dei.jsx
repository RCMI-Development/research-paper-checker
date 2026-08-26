import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import {
  C, F, DEFAULT_DEI_TERMS, Shell, Intake, Resultado, DatosCertificado, Certificado, InformeHallazgos,
  scanDei, hallazgosDei, extractText, saveCase,
} from "./shared.jsx";

/* Cotejo DEI — corre localmente sobre el texto extraído del PDF. No usa
   LM Studio: es un conteo determinista, auditable y repetible. */

function DeiPage() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [paginas, setPaginas] = useState([]);
  const [registroId, setRegistroId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ran, setRan] = useState(false);
  const [piName, setPiName] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [emitido, setEmitido] = useState(false);
  const [guardado, setGuardado] = useState(null);

  const termList = useMemo(
    () => DEFAULT_DEI_TERMS.map((t) => t.trim()).filter(Boolean),
    []
  );

  const dei = useMemo(() => (ran ? scanDei(text, termList) : null), [ran, text, termList]);
  const verdict = dei ? (dei.total ? "review" : "clear") : null;

  async function run() {
    setErr(""); setBusy(true); setRan(false);
    setEmitido(false); setGuardado(null);
    try {
      const data = await extractText(file);
      setText(data.text);
      setPaginas(data.pages || [data.text]);
      setRan(true);
    } catch (e) {
      setErr(e.message || "No se pudo completar el cotejo.");
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
        dei, verdict,
        model: "cotejo local (sin modelo)",
        signer: piName,
      });
      if (r?.id) setRegistroId(r.id);
      setGuardado(true);
    } catch {
      setGuardado(false);
    }
  }

  const oracion = !dei ? "" :
    dei.total
      ? `Se encontraron ${dei.total} término${dei.total === 1 ? "" : "s"} DEI en la propuesta.`
      : "No se encontraron términos DEI en la propuesta.";

  const findings = useMemo(
    () => (dei && dei.total ? hallazgosDei(paginas, dei.hits) : []),
    [dei, paginas]
  );

  const ready = file && !busy;
  const hayHallazgos = findings.length > 0;
  const paso3 = !!verdict;

  return (
    <Shell
      tag="DEI"
      title="Cotejo DEI"
      blurb="Conteo y ubicación de términos de diversidad, equidad e inclusión en el texto de la propuesta. Corre localmente, sin modelo de lenguaje: el mismo documento siempre da el mismo resultado."
    >
      <Intake
        file={file} setFile={setFile}
        onRun={run} busy={busy} ready={ready}
        runLabel="Iniciar cotejo DEI"
        err={err}
        note="Este cotejo no requiere LM Studio."
      />

      {dei && (
        <Resultado
          paso="Paso 02 · cotejo local, sin modelo"
          titulo="Resultado DEI"
          oracion={oracion}
          verdict={verdict}
              accent={dei.total ? C.stampAmber : C.stampBlue}
          extra={dei.total ? (
            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.rule}`,
              fontFamily: F.mono, fontSize: 11.5, color: C.soft,
            }}>
              {Object.keys(dei.hits).length} términos distintos · {dei.density.toFixed(1)} por mil palabras · {dei.words} palabras
            </div>
          ) : null}
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
          descripcion="fue cotejada localmente contra la lista institucional de términos de diversidad, equidad e inclusión, sin que se identificara ninguno en el texto."
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

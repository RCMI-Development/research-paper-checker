import { useState, useMemo, useRef, useEffect } from "react";

/* ─────────────────────────────────────────────────────────────
   Expediente de Cumplimiento — DGOF / IROC / DEI
   Local screening desk for federal life-sciences proposals.
   Evaluation runs against a local LM Studio model. Screening is
   advisory. Certification is a human act. Every signed case is
   written to the local audit log (server/data/cases.db).
   ───────────────────────────────────────────────────────────── */

const C = {
  paper: "#E5E7E0",
  card: "#FAFAF7",
  rule: "#C3C6BC",
  ink: "#16181C",
  soft: "#5C6068",
  stampBlue: "#2E3A8C",
  stampRed: "#A8202A",
  stampAmber: "#9A6B0F",
  tint: "#EDEFE7",
};

const DEFAULT_DEI_TERMS = [
  "diversity","diverse","equity","equitable","inclusion","inclusive","belonging",
  "underrepresented","underserved","minority","minorities","disparity","disparities",
  "marginalized","health equity","social justice","bias","barriers","cultural competence",
  "intersectional","systemic","advocacy","gender","women","LGBTQ","Hispanic","Latinx",
  "vulnerable populations","socioeconomic","accessibility","multicultural","racial",
  "ethnic","ethnicity","stigma","trauma","discrimination","disability","prejudice",
];

const DGOF_OUTCOMES = [
  "Enhances harmful consequences of the agent (incl. mirror organisms)",
  "Disrupts immune response or vaccine effectiveness",
  "Confers resistance to prophylactics/therapeutics or evades detection",
  "Increases stability, transmissibility, or dissemination",
  "Alters host range or tropism",
  "Enhances host population susceptibility",
  "Generates or reconstitutes an eradicated or extinct agent",
];

const STAGES = [
  { key: "intake", label: "Radicación" },
  { key: "dei", label: "Cotejo DEI" },
  { key: "dgof", label: "Evaluación DGOF" },
  { key: "iroc", label: "Evaluación IROC" },
  { key: "route", label: "Encaminamiento" },
  { key: "sign", label: "Certificación ICDGOF" },
];

const F = {
  display: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  body: "'Source Serif 4', Georgia, serif",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
};

/* ── small presentational pieces ── */

function Label({ children, style }) {
  return (
    <div style={{
      fontFamily: F.display, fontSize: 12, letterSpacing: "0.16em",
      textTransform: "uppercase", color: C.soft, fontWeight: 600, ...style,
    }}>{children}</div>
  );
}

function Spine({ state }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {STAGES.map((s, i) => {
        const st = state[s.key] || "pending";
        const dot = st === "done" ? C.stampBlue : st === "flag" ? C.stampAmber
          : st === "stop" ? C.stampRed : st === "active" ? C.ink : C.rule;
        return (
          <li key={s.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", paddingBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{
                width: 11, height: 11, borderRadius: 11, background: st === "pending" ? "transparent" : dot,
                border: `1.5px solid ${dot}`, marginTop: 4, flexShrink: 0,
              }} />
              {i < STAGES.length - 1 && (
                <span style={{ width: 1.5, flex: 1, minHeight: 20, background: C.rule, marginTop: 3 }} />
              )}
            </div>
            <div style={{ paddingBottom: 2 }}>
              <div style={{
                fontFamily: F.mono, fontSize: 9.5, color: C.soft, letterSpacing: "0.1em",
              }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{
                fontFamily: F.display, fontSize: 15, letterSpacing: "0.06em",
                textTransform: "uppercase", fontWeight: 600,
                color: st === "pending" ? C.soft : C.ink,
              }}>{s.label}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Stamp({ verdict, caseNo }) {
  const map = {
    clear:   { color: C.stampBlue,  text: "SIN HALLAZGOS",     sub: "Apto para certificación" },
    review:  { color: C.stampAmber, text: "REQUIERE REVISIÓN", sub: "Referir al IRE" },
    stop:    { color: C.stampRed,   text: "NO CERTIFICABLE",   sub: "Posible investigación prohibida" },
    unknown: { color: C.soft,       text: "INFORMACIÓN INSUFICIENTE", sub: "Consultar al PI" },
  };
  const v = map[verdict] || map.unknown;
  return (
    <div style={{
      border: `3px double ${v.color}`, color: v.color, padding: "14px 22px",
      transform: "rotate(-1.6deg)", display: "inline-block", textAlign: "center",
      background: "transparent", borderRadius: 3,
    }}>
      <div style={{
        fontFamily: F.display, fontSize: 26, fontWeight: 700,
        letterSpacing: "0.1em", lineHeight: 1, textTransform: "uppercase",
      }}>{v.text}</div>
      <div style={{ fontFamily: F.body, fontSize: 12, fontStyle: "italic", marginTop: 5 }}>{v.sub}</div>
      <div style={{
        fontFamily: F.mono, fontSize: 9.5, marginTop: 7, letterSpacing: "0.1em",
        borderTop: `1px solid ${v.color}`, paddingTop: 5,
      }}>{caseNo} · {new Date().toLocaleDateString("es-PR")}</div>
    </div>
  );
}

function Card({ title, eyebrow, children, accent }) {
  return (
    <section style={{
      background: C.card, border: `1px solid ${C.rule}`,
      borderLeft: `4px solid ${accent || C.rule}`, padding: "16px 18px", marginBottom: 16,
    }}>
      {eyebrow && <Label>{eyebrow}</Label>}
      <h3 style={{
        fontFamily: F.display, fontSize: 21, letterSpacing: "0.04em", textTransform: "uppercase",
        margin: "4px 0 12px", fontWeight: 600, color: C.ink,
      }}>{title}</h3>
      {children}
    </section>
  );
}

/* ── main ── */

export default function ComplianceScreener() {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [terms, setTerms] = useState(DEFAULT_DEI_TERMS.join(", "));
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dgof, setDgof] = useState(null);
  const [iroc, setIroc] = useState(null);
  const [signed, setSigned] = useState(false);
  const [signer, setSigner] = useState("");
  const [caseNo, setCaseNo] = useState(null);
  const [savedCase, setSavedCase] = useState(null);

  const [health, setHealth] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");

  const fileRef = useRef(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => {
        setHealth(h);
        setModels(h.models || []);
        setModel(h.models?.includes(h.defaultModel) ? h.defaultModel : h.models?.[0] || h.defaultModel);
      })
      .catch(() => setHealth({ ok: false, reachable: false }));
  }, []);

  const termList = useMemo(
    () => terms.split(",").map((t) => t.trim()).filter(Boolean),
    [terms]
  );

  /* DEI scan runs locally — deterministic, auditable, no model in the loop */
  const dei = useMemo(() => {
    if (!text.trim()) return null;
    const hits = {};
    let total = 0;
    termList.forEach((t) => {
      const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      const m = text.match(re);
      if (m) { hits[t] = m.length; total += m.length; }
    });
    const words = text.trim().split(/\s+/).length;
    return { hits, total, words, density: words ? (total / words) * 1000 : 0 };
  }, [text, termList]);

  const highlighted = useMemo(() => {
    if (!text.trim() || !dei || !Object.keys(dei.hits).length) return null;
    const found = Object.keys(dei.hits)
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`\\b(${found.join("|")})\\b`, "gi");
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) && i % 2 === 1
        ? <mark key={i} style={{ background: "#F2E3A8", color: C.ink, padding: "0 1px" }}>{p}</mark>
        : <span key={i}>{p}</span>
    );
  }, [text, dei]);

  async function readFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type === "application/pdf") {
      setText("");
    } else {
      const t = await f.text();
      setText(t);
    }
  }

  async function run() {
    setErr(""); setBusy(true); setDgof(null); setIroc(null); setSigned(false); setSavedCase(null); setCaseNo(null);
    try {
      const form = new FormData();
      if (file && file.type === "application/pdf") {
        form.append("file", file);
      } else {
        form.append("text", text);
      }
      form.append("model", model);

      const r = await fetch("/api/evaluate", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Error del servidor");

      setCaseNo(data.caseNo);
      setDgof(data.dgof);
      setIroc(data.iroc);
      if (data.proposalExcerpt && !text.trim()) setText(data.proposalExcerpt);
    } catch (e) {
      setErr(e.message || "La evaluación no se completó. Revisa el documento e inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  /* routing logic */
  const verdict = useMemo(() => {
    if (!dgof || !iroc) return null;
    if (dgof.determination === "likely" || iroc.determination === "prohibited_risk") return "stop";
    if (dgof.determination === "potential" || iroc.determination === "review_needed") return "review";
    if (dgof.determination === "insufficient" || iroc.determination === "insufficient") return "unknown";
    return "clear";
  }, [dgof, iroc]);

  const stageState = {
    intake: text || file ? "done" : "active",
    dei: dei ? (dei.total ? "flag" : "done") : "pending",
    dgof: dgof ? (dgof.determination === "none" ? "done" : dgof.determination === "likely" ? "stop" : "flag") : "pending",
    iroc: iroc ? (iroc.determination === "none" ? "done" : iroc.determination === "prohibited_risk" ? "stop" : "flag") : "pending",
    route: verdict ? (verdict === "stop" ? "stop" : verdict === "clear" ? "done" : "flag") : "pending",
    sign: signed ? "done" : verdict === "clear" ? "active" : "pending",
  };

  async function signOff() {
    setSigned(true);
    try {
      await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseNo,
          fileName: file?.name || null,
          proposalExcerpt: text.slice(0, 4000),
          dei,
          dgof,
          iroc,
          verdict,
          model,
          signer,
        }),
      });
      setSavedCase(true);
    } catch {
      setSavedCase(false);
    }
  }

  const email = useMemo(() => {
    if (!verdict || !caseNo) return "";
    const to = verdict === "clear"
      ? "Para: [PI]  ·  CC: Dra. Segarra, Sr. Camacho"
      : "Para: IRE / ICDGOF  ·  CC: [PI], Dra. Segarra, Sr. Camacho";
    const head = verdict === "clear"
      ? `Cotejo de cumplimiento completado — ${caseNo}`
      : `Propuesta referida a revisión institucional — ${caseNo}`;
    const body = verdict === "clear"
      ? `El cotejo preliminar de la propuesta ${caseNo} no identificó hallazgos de DGOF ni de IROC.\n\nSe adjuntan los tres informes (DEI, DGOF, IROC). Los certificados de cumplimiento DGOF e IROC quedan pendientes de la firma del ICDGOF y no son válidos hasta ese momento.\n\nUna vez certificados, la propuesta pasa al Decanato de Investigación para su aval.`
      : `El cotejo preliminar de la propuesta ${caseNo} identificó asuntos que requieren revisión del Institutional Review Entity (IRE).\n\nMotivo: ${dgof?.rationale || ""} ${iroc?.rationale || ""}\n\nSe adjuntan los tres informes. No se emite certificado hasta que el IRE complete su análisis de riesgo-beneficio con el PI.`;
    return `${to}\nAsunto: ${head}\n\n${body}\n\n—\nGenerado por cotejo automatizado (modelo local: ${model}). Documento de trabajo; no constituye certificación.`;
  }, [verdict, caseNo, dgof, iroc, model]);

  const ready = (text.trim().length > 40 || file) && !busy && health?.reachable;

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: F.body }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid ${C.stampBlue}; outline-offset: 2px; }
        .btn { font-family: ${F.display}; text-transform: uppercase; letter-spacing: .1em; font-weight: 600;
               font-size: 14px; padding: 11px 20px; border: 1.5px solid ${C.ink}; background: ${C.ink};
               color: ${C.card}; cursor: pointer; }
        .btn:hover { background: ${C.stampBlue}; border-color: ${C.stampBlue}; }
        .btn[disabled] { opacity: .35; cursor: not-allowed; }
        .btn-ghost { background: transparent; color: ${C.ink}; }
        .btn-ghost:hover { background: ${C.ink}; color: ${C.card}; }
        .grid { display: grid; grid-template-columns: 190px 1fr; gap: 30px; }
        @media (max-width: 760px) { .grid { grid-template-columns: 1fr; gap: 18px; } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "26px 20px 70px" }}>

        {/* masthead */}
        <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 12, marginBottom: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
            <div>
              <Label>Recinto de Ciencias Médicas · Decanato de Investigación</Label>
              <h1 style={{
                fontFamily: F.display, fontSize: 40, fontWeight: 700, margin: "2px 0 0",
                letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1,
              }}>Expediente de cumplimiento</h1>
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 11, color: C.soft, textAlign: "right", lineHeight: 1.7 }}>
              <div>{caseNo || "Sin radicar"}</div>
              <div>DGOF · IROC · DEI</div>
            </div>
          </div>
          <p style={{ fontSize: 14.5, margin: "10px 0 0", maxWidth: 640, color: C.soft, lineHeight: 1.55 }}>
            Cotejo preliminar de propuestas conforme a la política federal de julio de 2026.
            El resultado es un documento de trabajo: la certificación la firma una persona.
          </p>

          <div style={{
            marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center",
            fontFamily: F.mono, fontSize: 11.5, color: C.soft,
          }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: 8,
                background: health == null ? C.rule : health.reachable ? C.stampBlue : C.stampRed,
              }} />
              {health == null ? "Conectando a LM Studio…" : health.reachable ? "LM Studio en línea (localhost:1234)" : "LM Studio no disponible — abre la app y ábrelo en Developer › Local Server"}
            </span>
            {models.length > 0 && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Modelo:
                <select value={model} onChange={(e) => setModel(e.target.value)}
                  style={{ fontFamily: F.mono, fontSize: 11.5, padding: "3px 6px", border: `1px solid ${C.rule}`, background: "#fff" }}>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            )}
          </div>
        </header>

        <div className="grid">
          {/* routing spine */}
          <aside>
            <Label style={{ marginBottom: 12 }}>Trámite</Label>
            <Spine state={stageState} />
          </aside>

          <main>
            {/* intake */}
            <Card title="Radicación de la propuesta" eyebrow="Paso 01">
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setFile(null); }}
                placeholder="Pega aquí el texto de la propuesta — resumen, aims específicos, métodos, personal clave y sitios de estudio."
                style={{
                  width: "100%", minHeight: 150, padding: 12, fontFamily: F.body, fontSize: 14.5,
                  lineHeight: 1.6, border: `1px solid ${C.rule}`, background: "#fff", resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Adjuntar PDF</button>
                <input ref={fileRef} type="file" accept=".pdf,.txt,.md" onChange={readFile} style={{ display: "none" }} />
                {file && <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.soft }}>{file.name}</span>}
                <span style={{ flex: 1 }} />
                <button className="btn" onClick={run} disabled={!ready}>
                  {busy ? "Evaluando…" : "Iniciar cotejo"}
                </button>
              </div>
              {err && (
                <p style={{ color: C.stampRed, fontSize: 14, marginTop: 12, marginBottom: 0 }}>{err}</p>
              )}
            </Card>

            {/* DEI */}
            {dei && (
              <Card title="Informe DEI" eyebrow="Paso 02 · cotejo local, sin modelo" accent={dei.total ? C.stampAmber : C.stampBlue}>
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
                    <summary style={{ fontFamily: F.display, fontSize: 14, letterSpacing: ".08em",
                      textTransform: "uppercase", cursor: "pointer", color: C.soft }}>
                      Ver texto resaltado
                    </summary>
                    <div style={{
                      marginTop: 10, padding: 14, background: "#fff", border: `1px solid ${C.rule}`,
                      maxHeight: 280, overflow: "auto", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap",
                    }}>{highlighted}</div>
                  </details>
                )}
              </Card>
            )}

            {/* DGOF */}
            {dgof && (
              <Card title="Informe DGOF" eyebrow="Paso 03"
                accent={dgof.determination === "none" ? C.stampBlue : dgof.determination === "likely" ? C.stampRed : C.stampAmber}>
                <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 0 }}>{dgof.rationale}</p>
                <div style={{ fontFamily: F.mono, fontSize: 12, color: C.soft, marginBottom: 12 }}>
                  Determinación: <b style={{ color: C.ink }}>{dgof.determination}</b>
                  {dgof.in_silico_only && " · trabajo in silico"}
                  {!!dgof.agents?.length && ` · agentes: ${dgof.agents.join(", ")}`}
                </div>
                {!!dgof.outcomes?.length ? (
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
                {!!dgof.ask_pi?.length && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.rule}` }}>
                    <Label>Verificar con el PI</Label>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
                      {dgof.ask_pi.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            {/* IROC */}
            {iroc && (
              <Card title="Informe IROC" eyebrow="Paso 04"
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
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.rule}`, fontSize: 13.5, color: C.soft, lineHeight: 1.6 }}>
                  El cotejo no incluye la lista oficial de entidades de preocupación, aún no publicada.
                  Toda afiliación extranjera se verifica manualmente contra esa lista cuando salga.
                </div>
              </Card>
            )}

            {/* determination + routing */}
            {verdict && (
              <Card title="Encaminamiento" eyebrow="Paso 05"
                accent={verdict === "clear" ? C.stampBlue : verdict === "stop" ? C.stampRed : C.stampAmber}>
                <div style={{ padding: "6px 0 20px" }}><Stamp verdict={verdict} caseNo={caseNo} /></div>
                <p style={{ fontSize: 15, lineHeight: 1.6 }}>
                  {verdict === "clear" && "Los tres informes se envían al PI con copia a Dra. Segarra y Sr. Camacho. Los certificados DGOF e IROC se emiten al firmar el ICDGOF."}
                  {verdict === "review" && "La propuesta se refiere al Institutional Review Entity (IRE). El IRE y el PI completan el análisis inicial de riesgo-beneficio y lo comunican a la agencia federal. No se emite certificado en esta etapa."}
                  {verdict === "stop" && "El cotejo señala trabajo que podría estar prohibido. La propuesta se detiene, se notifica al ICDGOF y al IRE, y no continúa hasta que una persona resuelva el hallazgo. Si se confirma DGOF en trabajo activo, la notificación a la agencia federal ocurre dentro de 24 horas."}
                  {verdict === "unknown" && "El documento no contiene información suficiente para determinar. Solicitar al PI los detalles señalados en los informes antes de continuar."}
                </p>

                {/* human sign-off gate */}
                <div style={{
                  marginTop: 16, padding: 16, background: C.tint, border: `1px dashed ${C.rule}`,
                }}>
                  <Label>Certificación</Label>
                  <p style={{ fontSize: 14, lineHeight: 1.6, margin: "8px 0 12px" }}>
                    El cotejo automatizado no certifica. La certificación la hace el ICDGOF bajo su firma,
                    con las consecuencias legales que conlleva.
                  </p>
                  {verdict === "clear" ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <input value={signer} onChange={(e) => setSigner(e.target.value)}
                        placeholder="Nombre del ICDGOF"
                        style={{ padding: "9px 11px", border: `1px solid ${C.rule}`, fontFamily: F.body, fontSize: 14, flex: "1 1 200px" }} />
                      <button className="btn" disabled={!signer.trim() || signed}
                        onClick={signOff}>
                        {signed ? "Certificado" : "Firmar certificación"}
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 14, color: C.soft, margin: 0, fontStyle: "italic" }}>
                      No disponible: el expediente requiere revisión antes de certificarse.
                    </p>
                  )}
                  {signed && (
                    <p style={{ fontFamily: F.mono, fontSize: 12, marginTop: 12, marginBottom: 0, color: C.stampBlue }}>
                      Certificados DGOF e IROC emitidos por {signer} · {new Date().toLocaleString("es-PR")} · {caseNo}
                      {savedCase === true && " · guardado en el expediente local"}
                      {savedCase === false && " · aviso: no se pudo guardar en el expediente local"}
                    </p>
                  )}
                </div>
              </Card>
            )}

            {/* email draft */}
            {verdict && (
              <Card title="Borrador de correo" eyebrow="Paso 06">
                <pre style={{
                  fontFamily: F.mono, fontSize: 12.5, lineHeight: 1.7, whiteSpace: "pre-wrap",
                  background: "#fff", border: `1px solid ${C.rule}`, padding: 14, margin: 0, maxHeight: 320, overflow: "auto",
                }}>{email}</pre>
                <button className="btn btn-ghost" style={{ marginTop: 12 }}
                  onClick={() => navigator.clipboard?.writeText(email)}>Copiar</button>
              </Card>
            )}

            <p style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.65, marginTop: 26, borderTop: `1px solid ${C.rule}`, paddingTop: 14 }}>
              Prototipo. El cotejo automatizado es una ayuda de triaje: reduce el trabajo de lectura,
              no sustituye la atestación del PI ni la certificación del ICDGOF, ambas bajo pena de ley.
              Ninguna determinación de este sistema debe adjuntarse a una propuesta como evidencia de cumplimiento.
              La evaluación corre localmente contra un modelo servido por LM Studio en esta computadora — nada
              del texto de la propuesta sale de esta máquina.
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}

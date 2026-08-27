import { useState, useEffect, useRef, useCallback } from "react";
import { DeiPage } from "./dei.jsx";
import { DgofPage } from "./dgof.jsx";
import { IrocPage } from "./iroc.jsx";

import "./panel.css";

/* ─────────────────────────────────────────────────────────────
   Los tres cotejos viven en la misma página que los lanzó. No hay
   ventanas emergentes ni iframes — cada cotejo es un componente que
   se monta dentro de la sobrecapa y se mantiene montado al cambiar
   de pestaña, para que no se pierda el trabajo a medio hacer.

   Lo usan la página del Decanato (src/dec-invest.jsx) y el prototipo
   (src/proto-spa.jsx).
   ───────────────────────────────────────────────────────────── */

export const COTEJOS = [
  {
    key: "dei", label: "DEI", num: "COTEJO 01", accent: "var(--oro-osc)", Page: DeiPage,
    href: "/dei.html", nombre: "cotejoDEI",
    blurb: "Cuenta y resalta términos de diversidad, equidad e inclusión en el documento. Determinista: el mismo texto siempre da el mismo resultado.",
    meta: "Local · no usa modelo · instantáneo",
  },
  {
    key: "dgof", label: "DGOF", num: "COTEJO 02", accent: "var(--rojo)", Page: DgofPage,
    href: "/dgof.html", nombre: "cotejoDGOF",
    blurb: "Evalúa la propuesta contra los siete resultados de ganancia de función peligrosa y emite determinación con evidencia del texto.",
    meta: "Requiere LM Studio · emite certificado",
  },
  {
    key: "iroc", label: "IROC", num: "COTEJO 03", accent: "var(--azul)", Page: IrocPage,
    href: "/iroc.html", nombre: "cotejoIROC",
    blurb: "Identifica sitios fuera de EE. UU., personal clave con afiliación extranjera y posibles entidades de preocupación.",
    meta: "Requiere LM Studio · emite certificado",
  },
];

const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Panel({ keys, caseNo, onClose }) {
  const [active, setActive] = useState(keys[0]);
  const [resets, setResets] = useState({});
  const closeRef = useRef(null);
  const restoreRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();
    document.body.classList.add("locked");

    /* Sin Escape ni clic fuera: solo el ✕ o "Cerrar cotejo" cierran el
       expediente, para no botar trabajo a medio hacer por un clic al lado.
       Por eso el foco tiene que quedar atrapado adentro — si no, el teclado
       se sale del panel y ya no hay forma de volver a un botón de cierre. */
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      // Se consulta en cada Tab: los cotejos montan y desmontan controles
      // según avanza la corrida, así que una lista guardada queda vieja.
      const focusables = panelRef.current?.querySelectorAll(FOCUSABLES);
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("locked");
      restoreRef.current?.focus?.();
    };
  }, []);

  const reset = useCallback((key) => {
    setResets((r) => ({ ...r, [key]: (r[key] || 0) + 1 }));
  }, []);

  return (
    <div className="backdrop open" role="dialog" aria-modal="true" aria-label="Cotejo">
      <div className="panel" ref={panelRef}>
        <div className="panelbar" role="tablist">
          {keys.length > 1 && keys.map((key) => {
            const c = COTEJOS.find((x) => x.key === key);
            return (
              <button key={key} className="tab" type="button" role="tab"
                aria-selected={active === key} style={{ "--accent": c.accent }}
                onClick={() => setActive(key)}>{c.label}</button>
            );
          })}
          <span className="caseno">{caseNo || ""}</span>
          <button className="close" ref={closeRef} aria-label="Cerrar cotejo" onClick={onClose}>✕</button>
        </div>
        <div className="frames">
          {keys.map((key) => {
            const { Page } = COTEJOS.find((x) => x.key === key);
            return (
              <div key={key} className={active === key ? "active" : ""}>
                <Page key={resets[key] || 0} embedded caseNo={caseNo}
                  onClose={onClose} onReset={() => reset(key)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

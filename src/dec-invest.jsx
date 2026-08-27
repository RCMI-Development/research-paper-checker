import { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { COTEJOS, Panel } from "./panel.jsx";

/* ─────────────────────────────────────────────────────────────
   Lanzador de cotejos del Decanato de Investigación.

   El cotejo abre sobre esta misma página. Antes abría en una ventana
   emergente del sistema (window.open): el navegador la bloqueaba, se
   perdía detrás de otras ventanas y en macOS aparecía como ventana
   aparte. La sobrecapa no tiene ninguno de esos problemas.

   Las tarjetas siguen siendo enlaces de verdad: si el JS no carga, o
   si se hace clic-derecho › abrir en pestaña nueva, el cotejo abre
   igual en su propia página, que funciona sola.
   ───────────────────────────────────────────────────────────── */

const aviso = document.getElementById("aviso");
function avisar(mensaje) {
  if (!aviso) return;
  aviso.textContent = mensaje || "";
  aviso.hidden = !mensaje;
}

function Lanzador() {
  const [panel, setPanel] = useState(null);

  useEffect(() => {
    const tarjetas = [...document.querySelectorAll("[data-cotejo]")];

    const abrirUno = (event) => {
      // Cmd/Ctrl/Shift-clic y botón central son del navegador, no nuestros.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const cotejo = COTEJOS.find((c) => c.nombre === event.currentTarget.dataset.cotejo);
      if (!cotejo) return;
      event.preventDefault();
      avisar("");
      setPanel({ keys: [cotejo.key], caseNo: null });
    };

    const abrirTres = async () => {
      avisar("");
      try {
        // Un solo número para los tres, para que los informes queden
        // bajo el mismo caso. Ya no hace falta abrir nada antes del
        // fetch: sin ventanas emergentes no hay gesto que se venza.
        const respuesta = await fetch("/api/case-number");
        if (!respuesta.ok) throw new Error("No se pudo reservar el expediente");
        const { caseNo } = await respuesta.json();
        setPanel({ keys: COTEJOS.map((c) => c.key), caseNo });
      } catch {
        avisar("No se pudo reservar el número de expediente. Verifica que el servidor local esté corriendo (npm run dev) y vuelve a intentarlo.");
      }
    };

    const tres = document.getElementById("abrirTres");
    tarjetas.forEach((t) => t.addEventListener("click", abrirUno));
    tres?.addEventListener("click", abrirTres);
    return () => {
      tarjetas.forEach((t) => t.removeEventListener("click", abrirUno));
      tres?.removeEventListener("click", abrirTres);
    };
  }, []);

  if (!panel) return null;
  return <Panel keys={panel.keys} caseNo={panel.caseNo} onClose={() => setPanel(null)} />;
}

const montura = document.getElementById("cotejo");
if (montura) ReactDOM.createRoot(montura).render(<Lanzador />);

/* ── estado de LM Studio ── */

const punto = document.getElementById("punto");
const texto = document.getElementById("estadoTexto");

if (punto && texto) {
  fetch("/api/health")
    .then((r) => r.json())
    .then((salud) => {
      if (salud.reachable) {
        punto.className = "punto on";
        texto.textContent = `LM Studio en línea (localhost:1234) · modelo: ${salud.defaultModel}`;
      } else {
        punto.className = "punto off";
        texto.textContent =
          "LM Studio no disponible — préndelo en Developer › Local Server. El cotejo DEI funciona igual.";
      }
    })
    .catch(() => {
      punto.className = "punto off";
      texto.textContent = "No se pudo contactar el servidor local — ¿corriste npm run dev?";
    });
}

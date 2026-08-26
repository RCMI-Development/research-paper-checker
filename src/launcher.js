/* ─────────────────────────────────────────────────────────────
   Lanzador de cotejos del Decanato de Investigación.

   Cada cotejo corre en su propia ventana y funciona solo. "Abrir los
   tres a la vez" reserva un único número de expediente antes de
   abrirlos, para que los tres informes queden bajo el mismo caso.

   Las tarjetas son enlaces de verdad: si el JS no carga o el usuario
   hace clic-derecho › abrir en pestaña nueva, el cotejo abre igual.
   ───────────────────────────────────────────────────────────── */

const abiertas = new Map();

function abrirVentana(pagina, nombre, desfase = 0) {
  const previa = abiertas.get(nombre);
  if (previa && !previa.closed) {
    previa.focus();
    return previa;
  }

  const w = 1040;
  const h = Math.min(940, screen.availHeight - 80);
  const left = Math.max(0, (screen.availWidth - w) / 2 + desfase * 34);
  const top = Math.max(0, (screen.availHeight - h) / 2 + desfase * 34);
  const ventana = window.open(
    pagina,
    nombre,
    `popup=yes,width=${w},height=${h},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`,
  );
  if (!ventana) return null;
  abiertas.set(nombre, ventana);
  ventana.focus();
  return ventana;
}

const aviso = document.getElementById("aviso");
function marcarBloqueo(hubo) {
  if (aviso) aviso.hidden = !hubo;
}

const tarjetas = [...document.querySelectorAll("[data-cotejo]")];

for (const tarjeta of tarjetas) {
  tarjeta.addEventListener("click", (event) => {
    // Cmd/Ctrl/Shift-clic y botón central son del navegador, no nuestros.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const ventana = abrirVentana(tarjeta.getAttribute("href"), tarjeta.dataset.cotejo);
    marcarBloqueo(!ventana);
  });
}

document.getElementById("abrirTres")?.addEventListener("click", () => {
  // Se abren en blanco primero: el navegador solo concede ventanas
  // emergentes dentro del gesto del clic, no después de un fetch.
  const ventanas = tarjetas.map((t, i) => abrirVentana("about:blank", t.dataset.cotejo, i));
  if (ventanas.some((v) => !v)) {
    marcarBloqueo(true);
    return;
  }
  marcarBloqueo(false);

  fetch("/api/case-number")
    .then((respuesta) => {
      if (!respuesta.ok) throw new Error("No se pudo reservar el expediente");
      return respuesta.json();
    })
    .then(({ caseNo }) => {
      tarjetas.forEach((tarjeta, i) => {
        ventanas[i].location.href = `${tarjeta.getAttribute("href")}?caseNo=${encodeURIComponent(caseNo)}`;
      });
    })
    .catch(() => ventanas.forEach((v) => v.close()));
});

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

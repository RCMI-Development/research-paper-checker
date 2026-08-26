/* ─────────────────────────────────────────────────────────────
   Barra de navegación institucional.

   El CSS que envió IIS ya traía .menubtn, .abierta y .abierto, pero
   ningún archivo tenía el markup ni el JS: bajo 880 px el menú
   quedaba oculto sin forma de abrirlo. Esto es lo que faltaba.
   ───────────────────────────────────────────────────────────── */

const nav = document.querySelector(".mainnav");
if (nav) {
  const lista = nav.querySelector(".navlist");
  const menubtn = nav.querySelector(".menubtn");
  const desplegables = [...nav.querySelectorAll(".navlist > li")].filter((li) =>
    li.querySelector(":scope > button"),
  );

  function cerrarDesplegables(excepto) {
    for (const li of desplegables) {
      if (li === excepto) continue;
      li.classList.remove("abierto");
      li.querySelector(":scope > button").setAttribute("aria-expanded", "false");
    }
  }

  menubtn?.addEventListener("click", () => {
    const abierta = lista.classList.toggle("abierta");
    menubtn.setAttribute("aria-expanded", String(abierta));
    if (!abierta) cerrarDesplegables();
  });

  for (const li of desplegables) {
    const boton = li.querySelector(":scope > button");
    boton.addEventListener("click", (event) => {
      event.stopPropagation();
      const abierto = !li.classList.contains("abierto");
      cerrarDesplegables(li);
      li.classList.toggle("abierto", abierto);
      boton.setAttribute("aria-expanded", String(abierto));
    });
  }

  // Un decanato sin herramientas se lista para dar contexto, pero no navega.
  for (const enlace of nav.querySelectorAll('a[aria-disabled="true"]')) {
    enlace.addEventListener("click", (event) => event.preventDefault());
  }

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) cerrarDesplegables();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const abierto = desplegables.find((li) => li.classList.contains("abierto"));
    cerrarDesplegables();
    abierto?.querySelector(":scope > button").focus();
  });
}

# Prompt para replicar el sistema en otro asistente de IA

Copia todo lo que está debajo de la línea y pégalo como primer mensaje.

---

Necesito que construyas una aplicación web completa. Lee toda la especificación antes de escribir código. Es una herramienta de cumplimiento regulatorio real, con exposición legal — la precisión importa más que la velocidad.

## 1. Contexto

El Recinto de Ciencias Médicas de la Universidad de Puerto Rico (UPR-MSC) tiene que cumplir con la **USG Policy for Stopping High-Risk Life Sciences Research** (20 de julio de 2026, 12 pp.), anunciada en el NIH Guide Notice **NOT-OD-26-101** y emitida bajo la **Orden Ejecutiva 14292**. Reemplaza la política de DURC/PEPP de 2024 y pasa de un enfoque basado en listas de agentes a uno basado en resultados de riesgo.

Lo que la política exige a la institución, y que motiva esta herramienta:

- El **ICDGOF** (Institutional Contact for Dangerous Gain-of-Function Research) **certifica cada solicitud federal** como veraz, y el cumplimiento se monitorea **bajo pena de ley**.
- La institución **atesta** que cada propuesta fue evaluada para DGOF e IROC y correctamente atestada por el PI.
- El incumplimiento es **material para las decisiones de pago del Gobierno** bajo 31 U.S.C. 3729(b)(4) — el gancho de la False Claims Act. Una atestación negativa falsa deliberada puede causar revocación de fondos y hasta **5 años de inelegibilidad**.
- Una violación por parte de un beneficiario **puede considerarse violación de su institución**.

El Decanato de Investigación recibe propuestas y hoy las revisa a mano. La herramienta es un **escritorio de cribado (triaje)** que reduce el trabajo de lectura antes de la revisión humana, y que **le emite al investigador un certificado descargable** cuando su propuesta pasa el cribado.

## 2. Restricciones no negociables

Estas definen el producto. Si alguna te parece incorrecta, dímelo antes de codificar en vez de cambiarla por tu cuenta.

1. **Todo corre localmente.** El texto de las propuestas no puede salir de la computadora. Nada de APIs de nube. La evaluación usa un modelo servido por **LM Studio** en `http://localhost:1234/v1` (API compatible con OpenAI).
2. **El sistema no sustituye la certificación oficial.** Emite un certificado que documenta que la propuesta pasó el cribado automatizado; el certificado dice explícitamente que no sustituye la atestación del PI ni la certificación del ICDGOF.
3. **Sin cribado limpio no hay certificado.** Si el cotejo encuentra hallazgos, los pasos de certificado **no se renderizan** — no basta con deshabilitarlos.
4. **Cribado conservador.** Ante la duda, señalar para revisión humana en vez de despachar.
5. **Todo hallazgo va acompañado de su cita textual** de la propuesta. Un hallazgo sin evidencia no es accionable por un revisor humano.
6. **Registro auditable.** Cada caso emitido va a una base local con número de expediente, informes, veredicto, investigador, propuesta y fecha.
7. **El servidor solo escucha en `127.0.0.1`.** Contiene texto de propuestas sin publicar; no puede quedar expuesto a la red del campus.
8. **La interfaz va en español** (registro administrativo puertorriqueño). Los prompts al modelo van en inglés, porque la política fuente está en inglés.
9. **La aplicación no envía correos.** El investigador descarga su propio certificado y lo entrega.

## 3. Stack y por qué

- **Node.js 22.5+** con **`node:sqlite`** (módulo incorporado) para la base de datos.
  **No uses `better-sqlite3`**: es un módulo nativo y su compilación falla en Node 26 (errores de node-gyp con la API de V8). `node:sqlite` no compila nada y soporta parámetros con nombre (`@campo`).
- **Express 4** para el servidor.
- **multer 2.x** para subida de archivos. **No uses 1.x** — vulnerabilidades conocidas y deprecado.
- **pdf-parse** para extraer texto de PDF. Impórtalo como `pdf-parse/lib/pdf-parse.js` para evitar el código de depuración del index que intenta leer un PDF de prueba inexistente.
- **pdfkit** para generar el certificado en PDF. Es JS puro (no compila nada) y trae fuentes base (Helvetica, Times) sin necesidad de distribuir archivos de fuente.
- **Vite 5 + React 18** en modo **multi-página** (varios entry HTML, no un SPA con router).
- **dotenv** para configuración.

## 4. Estructura de archivos

```
dgof-iroc-screener/
├── package.json
├── vite.config.js
├── .env                 (no versionado)
├── .env.example
├── .gitignore
├── README.md
├── index.html           lanzador, HTML+CSS+JS puro, sin React
├── dei.html             entry → src/dei.jsx
├── dgof.html            entry → src/dgof.jsx
├── iroc.html            entry → src/iroc.jsx
├── server/
│   ├── index.js         Express: API + estáticos de producción
│   ├── db.js            esquema SQLite y creación de data/
│   ├── prompts.js       los dos prompts de política
│   └── certificado.js   generación del PDF
└── data/
    ├── cases.db         expediente auditable
    ├── uploads/         PDF originales
    └── certificados/    certificados emitidos
```

Cada cotejo es una página independiente que funciona sola por URL directa. `index.html` solo las lanza en ventanas emergentes.

## 5. Configuración (`.env`)

```
API_PORT=4000
HOST=127.0.0.1
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=openai/gpt-oss-20b
```

Usa `API_PORT`, **no `PORT`**: si el proceso se lanza desde una herramienta que inyecta `PORT` en el ambiente, el servidor de API y el de desarrollo colisionan en el mismo puerto y la API queda inalcanzable.

## 6. Base de datos

Tabla única `cases`:

| columna | tipo | nota |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `case_no` | TEXT NOT NULL UNIQUE | formato `RCM-<año>-<4 dígitos>` |
| `file_name`, `file_path` | TEXT | |
| `proposal_excerpt` | TEXT | primeros 4000 caracteres |
| `dei_report`, `dgof_report`, `iroc_report` | TEXT | JSON serializado |
| `verdict` | TEXT | |
| `model` | TEXT | |
| `signer` | TEXT | quien emitió |
| `signed_at` | TEXT | ISO |
| `pi_name` | TEXT | investigador del certificado |
| `proposal_title` | TEXT | título del certificado |
| `created_at` | TEXT NOT NULL DEFAULT (datetime('now')) | |

Activa `PRAGMA journal_mode = WAL`. El guardado usa `INSERT ... ON CONFLICT(case_no) DO UPDATE`.

**Crea `data/`, `data/uploads/` y `data/certificados/` con `mkdirSync({recursive:true})` antes de abrir la base.** SQLite no crea el directorio: en una instalación nueva el servidor falla con `unable to open database file`. Este error es fácil de no ver, porque solo aparece en un clon limpio.

Número de expediente: `RCM-${año}-${aleatorio 1000-9999}`, verificando colisión contra la tabla, hasta 20 intentos, con respaldo a timestamp.

## 7. API

### `GET /api/health`
Consulta `GET {LM_STUDIO_URL}/models`. Nunca falla: si LM Studio no responde devuelve `reachable: false` en vez de error.
```json
{ "ok": true, "reachable": true, "model": "openai/gpt-oss-20b", "loaded": true }
```
`loaded` indica si el modelo fijo está entre los cargados. **Consume exactamente estos nombres de campo en el frontend** — un campo renombrado sin actualizar el consumidor produce un `undefined` visible en pantalla.

### `GET /api/case-number`
`{ "caseNo": "RCM-2026-1234" }`. Lo usa el cotejo DEI, que es local y no pasa por el modelo.

### `POST /api/extract` (multipart, campo `file`)
Extrae texto de un PDF **sin evaluarlo**. Guarda el archivo. Devuelve `{ caseNo, fileName, filePath, text }`. Error 400 si el texto extraído tiene menos de 40 caracteres.

### `POST /api/evaluate` (multipart)
Campos: `file`, `tasks` (lista separada por comas: `dgof`, `iroc`). **No recibe modelo**: es fijo en el servidor.

Corre **solo las tareas pedidas**, en paralelo con `Promise.all`. Las no pedidas devuelven `null`. Esto permite que cada página independiente invoque solo su propio análisis.

### `POST /api/certificado` (JSON)
Recibe `{ cotejo, descripcion, piName, proposalTitle, caseNo }`. Genera el PDF, **archiva una copia** en `data/certificados/` y lo devuelve como descarga:

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="Certificado-DGOF-RCM-2026-4471-Maria-Rodriguez-Pena.pdf"
```

El nombre del archivo normaliza acentos (`NFD` + quitar `̀-ͯ`) para que no dé problemas al adjuntarlo entre sistemas.

### `POST /api/cases`, `GET /api/cases`, `GET /api/cases/:caseNo`
Guardar y consultar expedientes.

### Estáticos en producción
Después de las rutas de API, si existe `dist/index.html`, sirve `dist/` con `express.static`. Índice, cotejos y API comparten origen en un solo puerto, sin proxy. Escucha con `app.listen(PORT, HOST)` — el segundo argumento es obligatorio para que no quede en `0.0.0.0`.

## 8. Integración con LM Studio

`POST {LM_STUDIO_URL}/chat/completions` con `temperature: 0.2`, `max_tokens: 2500`, y un mensaje de sistema:

> "You are a compliance screening assistant. Respond with strict JSON only — no markdown fences, no commentary, no text before or after the JSON object."

El mensaje de usuario es el prompt de política seguido del texto envuelto en `<propuesta>...</propuesta>`.

### Extracción robusta de JSON — obligatoria

Los modelos locales no respetan el formato de forma confiable:

1. Quita cercas de markdown (` ```json ` y ` ``` `) y espacios.
2. Intenta `JSON.parse`.
3. Si falla, busca el primer `{` y el último `}` y parsea esa subcadena.
4. Si aún falla, lanza un error legible en español.

### Hechos verificados sobre los modelos — no los redescubras

- **El PDF no se le puede pasar al modelo.** La API de LM Studio rechaza bloques de documento: `'content' objects must have a 'type' field that is either 'text' or 'image_url'`. Y `openai/gpt-oss-20b` rechaza imágenes: `does not support image inputs`. Por eso el PDF **tiene** que convertirse a texto antes. La única alternativa sería un modelo de visión con las páginas como imágenes, lo que descarta gpt-oss-20b.
- **`max_tokens` alto es necesario.** gpt-oss-20b gasta parte del presupuesto en tokens de razonamiento antes de emitir el JSON; con 1200 se quedaba corto.
- **Un modelo listado en `/v1/models` puede no estar cargado** y devolver HTTP 500. Por eso `health` reporta `loaded`.
- **Otros modelos de razonamiento no sirven sin ajuste**: `qwen3-8b` y `nemotron-3-nano` devuelven `content: ""` y ponen todo en `reasoning_content`.

## 9. Los dos prompts de política — usar **textualmente**

Estos codifican la regulación. No los parafrasees ni los "mejores": el comportamiento de cribado depende de su redacción exacta, incluida la aclaración sobre Puerto Rico.

### DGOF

```
You screen federal research proposals against the USG Policy for Stopping High-Risk Life Sciences Research (July 2026).

DGOF = research with a biological agent that seeks, achieves, or has substantial risk of achieving any of these outcomes AND could cause significant negative societal consequences:
1 Enhancing harmful consequences of the agent (incl. mirror organisms)
2 Disrupting immune response or vaccine effectiveness
3 Conferring resistance to prophylactics/therapeutics or evading detection
4 Increasing stability, transmissibility, or dissemination
5 Altering host range or tropism
6 Enhancing host population susceptibility
7 Generating or reconstituting an eradicated or extinct agent

"Potential DGOF" = could potentially result in one of those outcomes. Purely in silico work is out of scope unless it leads to creating/modifying an agent, or involves an entity of concern.

You are a screening aid, not a certifier. Be conservative: flag for human review rather than clearing. Most clinical, epidemiological, behavioral, health-services, and bioinformatics research has no DGOF nexus — say so plainly when true.

Return ONLY compact JSON, no prose, no markdown:
{"determination":"none|potential|likely|insufficient",
 "agents":["biological agents named, [] if none"],
 "in_silico_only":true|false,
 "outcomes":[{"n":1-7,"evidence":"under 12 words quoted from the text","note":"one sentence"}],
 "rationale":"one sentence",
 "ask_pi":["question for the PI"]}
Include outcomes only where there is real textual basis, and every outcome MUST quote the exact words
from the proposal in "evidence". Keep total output under 700 tokens.
```

### IROC

```
You screen federal research proposals for International Research of Concern (IROC) under the USG Policy for Stopping High-Risk Life Sciences Research (July 2026).

Prohibited: research conducted in a country of concern, or conducted outside the U.S. by an institution or individual of concern.
Restricted: other life sciences research abroad in a country with oversight that may not meet U.S. biosafety/biosecurity standards — permissible only after risk-based assessment.
Domestic-only research, including Puerto Rico and other U.S. territories, is NOT foreign and raises no IROC issue on that basis alone.

You are a screening aid, not a certifier. Identify what a human reviewer must verify against the official entities-of-concern list, which you do not have.

Return ONLY compact JSON, no prose, no markdown:
{"determination":"none|review_needed|prohibited_risk|insufficient",
 "foreign_sites":[{"country":"","entity":"","role":"one phrase","evidence":"under 12 words quoted from the text"}],
 "collaborators":[{"name":"","affiliation":"","country":"","evidence":"under 12 words quoted from the text"}],
 "rationale":"one sentence",
 "ask_pi":["question for the PI"]}
Every finding MUST carry an "evidence" field quoting the exact words from the proposal that support it.
Empty arrays when nothing is found. Keep total output under 700 tokens.
```

La línea sobre Puerto Rico es crítica: sin ella el modelo marca como extranjera toda investigación hecha en el recinto.

## 10. Cotejo DEI — local, sin modelo

**No usa LM Studio.** Es un conteo determinista con expresiones regulares sobre el texto extraído del PDF: el mismo documento siempre da el mismo resultado, lo que hace el informe defendible en auditoría.

Lista predeterminada:

```
diversity, diverse, equity, equitable, inclusion, inclusive, belonging,
underrepresented, underserved, minority, minorities, disparity, disparities,
marginalized, health equity, social justice, bias, barriers, cultural competence,
intersectional, systemic, advocacy, gender, women, LGBTQ, Hispanic, Latinx,
vulnerable populations, socioeconomic, accessibility, multicultural, racial,
ethnic, ethnicity, stigma, trauma, discrimination, disability, prejudice
```

Para cada término: `new RegExp("\\b" + escapado + "\\b", "gi")`, escapando los metacaracteres.

Además del conteo, implementa una función que devuelva **fragmentos de contexto** (±55 caracteres alrededor de cada aparición, con elipsis), para mostrar *dónde* en el texto aparece el término y no solo cuántas veces.

En este cotejo, **encontrar términos DEI es el hallazgo**: cero términos = pasa.

## 11. Lógica de veredicto

| informe | determinación | severidad |
|---|---|---|
| DGOF | `likely` / `potential` / `insufficient` / `none` | `stop` / `review` / `unknown` / `clear` |
| IROC | `prohibited_risk` / `review_needed` / `insufficient` / `none` | `stop` / `review` / `unknown` / `clear` |
| DEI | ≥1 término / 0 términos | `review` / `clear` |

Escríbelo como una función que reciba las severidades presentes y devuelva la peor (`stop` > `review` > `unknown` > `clear`), no como una cadena de condicionales.

Solo `clear` habilita el certificado.

## 12. Diseño visual

Estética de **expediente administrativo impreso**: papel, sellos de goma, tipografía condensada de formulario. Nada de gradientes, sombras suaves ni estilo SaaS.

```
paper      #E5E7E0     fondo
card       #FAFAF7     tarjetas
rule       #C3C6BC     líneas
ink        #16181C     texto
soft       #5C6068     texto secundario
stampBlue  #2E3A8C     aprobado
stampRed   #A8202A     detenido
stampAmber #9A6B0F     revisión
tint       #EDEFE7     fondos internos
```

Tipografías (Google Fonts): **Barlow Condensed** (títulos, mayúsculas, `letter-spacing` amplio), **Source Serif 4** (cuerpo), **IBM Plex Mono** (metadatos y números de expediente).

El sello del veredicto va rotado `-1.6deg`, con borde `3px double` del color del veredicto y el número de expediente con la fecha debajo de una línea. Cada tarjeta lleva un borde izquierdo de 4px del color de su determinación, y un "eyebrow" arriba: `PASO 01`, `PASO 02`…

## 13. Las páginas

### `index.html` — lanzador
HTML, CSS y JS puros. Sin React.

- Encabezado institucional y estado de LM Studio en vivo desde `/api/health` (punto azul/rojo), incluyendo el caso de "en línea pero el modelo no está cargado".
- Tres fichas clicables (DEI ámbar, DGOF rojo, IROC azul) con número de cotejo, descripción y metadatos.
- Botón **Abrir los tres a la vez**, escalonando las ventanas ~34px.
- Apertura: `window.open(pagina, nombre, "popup=yes,width=1040,height=...,left=...,top=...,resizable=yes,scrollbars=yes")`, centrada.
- Guarda las referencias en un `Map`; si la ventana ya está abierta, la reenfoca en vez de duplicarla.
- Si `window.open` devuelve `null`, muestra un aviso tomando el host de `location.host` (no escrito fijo).
- Rejilla de 3 columnas que colapsa a 1 bajo 800px.

### `dei.html`, `dgof.html`, `iroc.html` — flujo de cuatro pasos

Las tres comparten armazón y siguen exactamente esta secuencia:

**Paso 01 · Radicación.** Solo subida de archivo. **Sin área de texto**: no se pega texto, se sube el documento.

**Paso 02 · Resultado.** Encabezado de **una sola oración** que dice si se encontraron infracciones o no:
- «No se encontraron infracciones DGOF en la propuesta.»
- «Se encontraron infracciones IROC en la propuesta.»
- «Se encontraron 10 términos DEI en la propuesta.»

Si **hay hallazgos**: lista de conceptos que no cumplen, y bajo cada uno **la cita textual de la propuesta** donde aparece, en monoespaciado con un filete ámbar a la izquierda. Aquí termina el trámite.

Si **no hay hallazgos**: el sello **SIN HALLAZGO** y el trámite continúa.

**Paso 03 · Datos del certificado.** *Solo se renderiza si el veredicto es `clear`.* Dos campos: nombre del investigador y título de la propuesta. Botón **Emitir certificado**, deshabilitado hasta que ambos estén llenos. Al emitir, guarda el caso vía `POST /api/cases`.

**Paso 04 · Certificado.** *Solo tras emitir.* Muestra el certificado en pantalla y un botón **Descargar certificado (PDF)** que hace `fetch` a `/api/certificado`, convierte la respuesta en `blob`, crea un `<a download>` con el nombre del header `Content-Disposition` y lo dispara. **Sin diálogo de impresión.**

Incluye un aviso destacado: *"Este certificado debe ser enviado al **Sr. Camacho** y a la **Dra. Segarra**."*

No hay borrador de correo ni firma del ICDGOF en la interfaz: el investigador emite y descarga su propio certificado.

## 14. El certificado en PDF (`server/certificado.js`)

Tamaño LETTER, márgenes 54pt, una sola página. Marco rectangular de 2pt. Contenido centrado, arrancando en `y = 140` para que quede ópticamente balanceado en la hoja.

Orden vertical:
1. `UNIVERSIDAD DE PUERTO RICO · RECINTO DE CIENCIAS MÉDICAS` / `DECANATO DE INVESTIGACIÓN` (Helvetica-Bold 9pt, `characterSpacing: 1.6`, gris)
2. `CERTIFICADO DE CUMPLIMIENTO` (Helvetica-Bold 26pt)
3. `COTEJO DGOF|IROC|DEI` (Helvetica-Bold 15pt, azul, `characterSpacing: 2.4`)
4. Filete corto centrado
5. *"Se certifica que la propuesta"* (Times-Italic 11.5pt)
6. **Título de la propuesta** (Times-Bold 17pt, centrado, con ancho limitado para que envuelva)
7. *"sometida por"* (Times-Italic)
8. **Nombre del investigador** (Helvetica-Bold 23pt)
9. Descripción del cotejo realizado (Times-Roman 11.5pt)
10. Filete y pie con `EXPEDIENTE` a la izquierda y `FECHA DE EMISIÓN` a la derecha
11. Descargo en Times-Italic 8.5pt: *"Documento generado por cotejo automatizado como ayuda de triaje. No sustituye la atestación del investigador principal ni la certificación del ICDGOF."*

Fecha en español largo (`25 de agosto de 2026`) con un arreglo de meses propio.

**Detalle de implementación:** pdfkit no centra bien el texto cuando se usa `characterSpacing`. Escribe un helper que mida con `doc.widthOfString(texto, { characterSpacing })` y calcule la `x` a mano.

**Verifica el caso extremo:** un título de ~180 caracteres y un nombre largo deben seguir cabiendo en una sola página.

## 15. Build multi-página

En `vite.config.js`, declara los cuatro entries en `build.rollupOptions.input` (`index`, `dei`, `dgof`, `iroc`) con rutas absolutas. En desarrollo, proxea `/api` a `http://localhost:4000`.

```json
"build":  "vite build",
"start":  "node server/index.js",
"setup":  "npm install && npm run build",
"dev":    "concurrently -n server,web \"node server/index.js\" \"vite\""
```

## 16. Pruebas de aceptación

Verifica cada una **ejecutándola de verdad**, no por inspección del código:

1. `GET /api/health` reporta el modelo y si está cargado; con LM Studio apagado devuelve `reachable: false` sin romperse.
2. Propuesta clínica benigna → DGOF `none` → aparecen los pasos 03 y 04.
3. Propuesta con sitio en el extranjero (laboratorio en Lima, Perú, con co-investigador afiliado allá) → IROC `review_needed`, con sitio y colaborador extraídos **y su cita textual**, y los pasos 03 y 04 **ausentes del DOM**.
4. Propuesta hecha solo en Puerto Rico → IROC `none`. Si sale marcada como extranjera, el prompt está mal copiado.
5. `tasks=iroc` devuelve `dgof: null`.
6. DEI con términos conocidos → conteo correcto y fragmentos de contexto que muestran dónde aparecen.
7. El botón de descarga produce un archivo PDF real (verifica con `file`: debe decir `PDF document, 1 pages`) con el nombre correcto y acentos normalizados.
8. Un título de propuesta muy largo sigue produciendo un PDF de una sola página.
9. `npm run build` genera las cuatro páginas HTML con su chunk propio.
10. Con la build hecha, `npm start` sirve `/`, `/dei.html`, `/dgof.html`, `/iroc.html` y `/api/health` — todas 200 en el mismo puerto.
11. `lsof -iTCP:4000 -sTCP:LISTEN` muestra `127.0.0.1:4000`, **no** `0.0.0.0`.
12. **Instalación limpia:** extrae el proyecto en una carpeta vacía y corre `npm install && npm run build && npm start`. Debe arrancar sin errores — es donde aparece el fallo de `data/` inexistente.
13. Ninguna página muestra `undefined` en pantalla (revisa que los nombres de campo que devuelve `/api/health` coincidan con los que lee el frontend).

**Importante sobre los datos de prueba:** si emites certificados durante las pruebas, borra los expedientes y los PDF al terminar. Un certificado ficticio a nombre de una persona real dentro de un registro de cumplimiento es un problema, no un residuo inocuo.

## 17. Entregable final

Además del código, escribe un `README.md` **en español y orientado a producción** (no a desarrollo): requisitos, instalación, uso diario paso a paso, tabla de páginas, dónde viven los datos y la advertencia de incluirlos en el respaldo, configuración, mantenimiento, y una sección honesta de **límites conocidos** — que la lista oficial de entidades de preocupación aún no existe, que el modelo local puede errar en ambas direcciones, que no hay control de acceso, y que el PDF se convierte a texto antes de llegar al modelo porque la API local no acepta documentos.

Empieza confirmando tu plan y señalando cualquier punto de la especificación que te parezca equivocado. Luego construye, y prueba de verdad cada punto de la sección 16 antes de decir que está listo.

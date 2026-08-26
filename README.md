# Expediente de Cumplimiento — DGOF / IROC / DEI

Cotejo preliminar de propuestas de investigación conforme a la política federal de
julio de 2026 (EO 14292), para el Decanato de Investigación del Recinto de Ciencias
Médicas.

Corre enteramente en la computadora donde se instala: el texto de la propuesta
nunca sale de esa máquina. La evaluación se hace contra un modelo servido
localmente por LM Studio, y el servidor solo acepta conexiones desde `localhost`.

> **El cotejo es una ayuda de triaje.** El certificado que emite documenta que la
> propuesta pasó el cribado automatizado; no sustituye la atestación del PI ni la
> certificación del ICDGOF, ambas bajo pena de ley.

## Requisitos

- **Node.js 22.5 o superior** (usa `node:sqlite`, incluido a partir de esa versión).
  Verifica con `node -v`.
- **[LM Studio](https://lmstudio.ai)** con al menos un modelo de chat descargado.
  El modelo es **fijo**: `openai/gpt-oss-20b`. Debe estar cargado en LM Studio.

## Instalación

Una sola vez, en la computadora donde va a correr:

```bash
cd ~/dgof-iroc-screener
npm run setup
```

Eso instala las dependencias y compila las páginas a `dist/`.

## Uso diario

### 1. Prende el servidor local de LM Studio

Abre LM Studio → pestaña **Developer** (ícono `</>`) → **Local Server** →
**Start Server**. Debe quedar escuchando en `http://localhost:1234` con al menos
un modelo cargado.

> El cotejo DEI funciona sin LM Studio. DGOF e IROC no.

### 2. Arranca la aplicación

```bash
npm start
```

### 3. Abre el índice

Ve a **http://localhost:4000** en el navegador. Debe verse un punto verde y
"LM Studio en línea (localhost:1234)". Si sale en rojo, revisa el paso 1.

### 4. Escoge el cotejo

El índice muestra tres fichas; cada una abre **su propia ventana** y funciona por
separado:

- **DEI** — conteo y ubicación de términos de diversidad, equidad e inclusión
- **DGOF** — evaluación de ganancia de función peligrosa
- **IROC** — evaluación de investigación internacional de preocupación

Los tres emiten certificado cuando el cotejo pasa.

El botón **Abrir los tres a la vez** lanza las tres ventanas escalonadas, para
correr los tres cotejos del mismo documento en paralelo.

> Si el navegador bloquea las ventanas emergentes, el índice lo avisa. Hay que
> permitir emergentes para `localhost:4000`.

### Paso 01 · Radica la propuesta

Dale a **Adjuntar PDF** y sube el documento. Los PDF escaneados sin capa de
texto no sirven: hay que pasarles OCR primero.

### Paso 02 · Resultado

Una sola oración dice si se encontraron infracciones o no.

- **Si no pasó** — se listan los conceptos que no cumplen y, bajo cada uno, la
  cita exacta del texto de la propuesta donde aparece. El trámite termina ahí:
  no se emite certificado.
- **Si pasó** — aparece el sello **SIN HALLAZGO** y el trámite continúa.

DEI es instantáneo. DGOF e IROC toman entre 15 segundos y un par de minutos.

### Paso 03 · Datos del certificado

Solo aparece si el cotejo pasó. Se escriben el **nombre del investigador** y el
**título de la propuesta**, y se da a **Emitir certificado**. Eso guarda el caso
en `data/cases.db` como registro auditable.

### Paso 04 · Certificado

El investigador ve su certificado en pantalla con su nombre, el título de la
propuesta, la fecha de emisión y el número de expediente. El botón
**Descargar certificado (PDF)** baja el archivo directamente — sin diálogo de
impresión — con un nombre como:

```
Certificado-DGOF-RCM-2026-4471-Maria-Rodriguez-Pena.pdf
```

El certificado se genera en el momento, en esta computadora. La aplicación no
envía correos: el investigador baja su propio certificado y lo entrega al
**Sr. Camacho** y a la **Dra. Segarra**.

Cada certificado emitido se archiva además en `data/certificados/`.

## Páginas

Cada cotejo es una página independiente; se puede abrir directo por URL sin
pasar por el índice.

| Página | URL | Necesita LM Studio |
|---|---|---|
| Índice / lanzador | `/` | no |
| Cotejo DEI | `/dei.html` | no |
| Cotejo DGOF | `/dgof.html` | sí |
| Cotejo IROC | `/iroc.html` | sí |

## Dónde queda todo

- **Expediente / auditoría**: `data/cases.db` (SQLite) — un registro por caso guardado
- **PDF originales subidos**: `data/uploads/`
- **Certificados emitidos**: `data/certificados/`

Nada de esto se sube a ningún sitio. Los tres son parte del récord de
cumplimiento: **inclúyelos en el respaldo (backup) de la máquina.**

## Configuración

Editable en `.env`:

```
API_PORT=4000
HOST=127.0.0.1
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=openai/gpt-oss-20b
```

`HOST=127.0.0.1` limita el acceso a esta computadora. **No lo cambies a `0.0.0.0`**
sin antes resolver autenticación: expondría texto de propuestas sin publicar a
cualquiera en la red del recinto.

El modelo es fijo: la interfaz ya no permite escogerlo. Para cambiarlo hay que
editar `LM_STUDIO_MODEL` aquí y reiniciar.

## Mantenimiento

Después de cambiar cualquier archivo de `src/` o los prompts de
`server/prompts.js`, hay que recompilar:

```bash
npm run build
```

Consultar el expediente sin abrir el navegador:

```bash
sqlite3 data/cases.db "SELECT case_no, pi_name, proposal_title, verdict, signed_at FROM cases ORDER BY created_at DESC;"
```

## Límites conocidos

- La **lista oficial de entidades de preocupación** aún no se publica. El cotejo
  IROC señala afiliaciones extranjeras para que un humano las verifique contra
  esa lista cuando salga; no la sustituye.
- El modelo local puede equivocarse en ambas direcciones. El prompt está escrito
  para ser conservador (señalar en vez de despachar), pero un veredicto de
  "sin hallazgos" no exime al PI de su atestación.
- No hay control de acceso: quien tenga la sesión abierta en esa computadora
  puede emitir certificados. Si eso importa, corre la aplicación en una cuenta de
  usuario dedicada.
- El PDF se convierte a texto antes de llegar al modelo. `openai/gpt-oss-20b` es
  un modelo de solo texto y la API de LM Studio no acepta documentos, así que no
  es posible pasarle el PDF directamente.

## Desarrollo

Para trabajar en el código con recarga automática:

```bash
npm run dev
```

Levanta el servidor en `localhost:4000` y Vite en `localhost:5173`; usa
**http://localhost:5173** en ese modo.

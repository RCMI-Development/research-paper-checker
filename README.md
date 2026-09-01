# Expediente de Cumplimiento — DGOF / IROC / DEI

Cotejo preliminar de propuestas de investigación conforme a la política federal de
julio de 2026 (EO 14292), para el Decanato de Investigación del Recinto de Ciencias
Médicas.

Puede evaluar con un modelo local servido por LM Studio o con cualquiera de los
modelos de chat disponibles en OpenRouter. El servidor de la aplicación solo
acepta conexiones desde `localhost` por defecto.

> **El cotejo es una ayuda de triaje.** El certificado que emite documenta que la
> propuesta pasó el cribado automatizado; no sustituye la atestación del PI ni la
> certificación del ICDGOF, ambas bajo pena de ley.

## Requisitos

- **Node.js 22.5 o superior** (usa `node:sqlite`, incluido a partir de esa versión).
  Verifica con `node -v`.
- Uno de estos proveedores de modelos:
  - **[LM Studio](https://lmstudio.ai)** con un modelo de chat descargado y cargado.
  - **[OpenRouter](https://openrouter.ai)** con una clave API y crédito suficiente
    para el modelo escogido.

## Instalación

Una sola vez, en la computadora donde va a correr:

```bash
cd ~/dgof-iroc-screener
npm run setup
```

Eso instala las dependencias y compila las páginas a `dist/`.

## Uso diario

### 1. Prepara el proveedor de modelos

Con `AI_PROVIDER=lmstudio`, abre LM Studio → **Developer** → **Local Server** →
**Start Server**. Con `AI_PROVIDER=openrouter`, configura `OPENROUTER_API_KEY` y
`OPENROUTER_MODEL` en `.env`; no hace falta abrir LM Studio.

> El cotejo DEI no usa ningún proveedor. DGOF e IROC sí.

### 2. Arranca la aplicación

```bash
npm start
```

### 3. Abre el índice

Ve a **http://localhost:4000** en el navegador. Debe verse un punto verde con el
proveedor y modelo activos. Si sale en rojo, revisa el paso 1.

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

| Página | URL | Necesita proveedor de IA |
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
AI_PROVIDER=lmstudio
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=openai/gpt-oss-20b

OPENROUTER_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-oss-20b
OPENROUTER_APP_NAME=RCM Research Paper Checker
# OPENROUTER_SITE_URL=https://example.edu
```

`HOST=127.0.0.1` limita el acceso a esta computadora. **No lo cambies a `0.0.0.0`**
sin antes resolver autenticación: expondría texto de propuestas sin publicar a
cualquiera en la red del recinto.

Usa `AI_PROVIDER=lmstudio` o `AI_PROVIDER=openrouter`. El modelo no se selecciona
en el navegador: cambia `LM_STUDIO_MODEL` u `OPENROUTER_MODEL` y reinicia la app.
Los identificadores de OpenRouter se copian de su catálogo, por ejemplo
`anthropic/claude-sonnet-4.5` o un identificador que termine en `:free` cuando esté
disponible. La clave API solo vive en el servidor y nunca se envía al navegador.

`OPENROUTER_SITE_URL` y `OPENROUTER_APP_NAME` son metadatos opcionales de
atribución. No pongas la clave en archivos de `src/` ni en HTML.

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
- El modelo puede equivocarse en ambas direcciones. El prompt está escrito
  para ser conservador (señalar en vez de despachar), pero un veredicto de
  "sin hallazgos" no exime al PI de su atestación.
- No hay control de acceso: quien tenga la sesión abierta en esa computadora
  puede emitir certificados. Si eso importa, corre la aplicación en una cuenta de
  usuario dedicada.
- El PDF se convierte a texto antes de llegar al modelo. Con OpenRouter, ese texto
  sale de la computadora y queda sujeto a las políticas del proveedor y del modelo
  escogido; no se debe habilitar para propuestas confidenciales sin autorización
  institucional y una revisión de privacidad adecuada.

## Desarrollo

Para trabajar en el código con recarga automática:

```bash
npm run dev
```

Levanta el servidor en `localhost:4000` y Vite en `localhost:5173`; usa
**http://localhost:5173** en ese modo.

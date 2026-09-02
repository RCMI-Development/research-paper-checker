# Expediente de Cumplimiento — DGOF / IROC / DEI

Cotejo preliminar de propuestas de investigación conforme a la política federal de
julio de 2026 (EO 14292), para el Decanato de Investigación del Recinto de Ciencias
Médicas.

Puede evaluar con un modelo local —servido por **Ollama** en un servidor o por
**LM Studio** en un escritorio— o con cualquiera de los modelos de chat de
OpenRouter. El servidor de la aplicación solo acepta conexiones desde `localhost`
por defecto; para instalarlo en un servidor, ver [Despliegue](#despliegue-en-un-servidor).

> **El cotejo es una ayuda de triaje.** El certificado que emite documenta que la
> propuesta pasó el cribado automatizado; no sustituye la atestación del PI ni la
> certificación del ICDGOF, ambas bajo pena de ley.

## Requisitos

- **Node.js 22.13 o superior** (usa `node:sqlite`, que estuvo detrás de un flag
  hasta esa versión). Se recomienda **24 LTS**. Verifica con `node -v`.
- Uno de estos proveedores de modelos:
  - **[Ollama](https://ollama.com)** — el proveedor local para un servidor sin
    escritorio. Lo instala y configura `scripts/provision.sh`.
  - **[LM Studio](https://lmstudio.ai)** con un modelo de chat descargado y cargado.
  - **[OpenRouter](https://openrouter.ai)** con una clave API y crédito suficiente
    para el modelo escogido. Saca el texto de la propuesta de la máquina.

## Instalación

Una sola vez, en la computadora donde va a correr:

```bash
cd ~/dgof-iroc-screener
npm run setup
```

Eso instala las dependencias y compila las páginas a `dist/`.

## Uso diario

### 1. Prepara el proveedor de modelos

Con `AI_PROVIDER=ollama` no hay que hacer nada: `ollama.service` arranca solo y
mantiene el modelo cargado. Con `AI_PROVIDER=lmstudio`, abre LM Studio →
**Developer** → **Local Server** → **Start Server**. Con `AI_PROVIDER=openrouter`,
configura `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` en `.env`.

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

OLLAMA_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=llama3.1:8b

LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=openai/gpt-oss-20b

OPENROUTER_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-oss-20b
OPENROUTER_APP_NAME=RCM Research Paper Checker
# OPENROUTER_SITE_URL=https://example.edu
```

`HOST=127.0.0.1` limita el acceso a esta computadora, y es el valor por defecto.
`HOST=0.0.0.0` abre la aplicación a toda la red — **la aplicación no tiene ningún
control de acceso**, así que cualquiera que alcance el puerto puede leer las
propuestas guardadas y emitir certificados. `scripts/provision.sh` usa `0.0.0.0`
porque es lo que se pidió para el servidor de la unidad, y compensa limitando el
puerto a rangos privados con `ufw`; eso es confianza en la red, no autenticación.
Si no lo necesitas, instala con `--localhost` y entra por un túnel SSH.

Usa `AI_PROVIDER=ollama`, `lmstudio` u `openrouter`. El modelo no se selecciona en
el navegador: cambia `OLLAMA_MODEL`, `LM_STUDIO_MODEL` u `OPENROUTER_MODEL` y
**reinicia la app** — la configuración se lee una sola vez al arrancar
(`sudo systemctl restart research-paper-checker` en el servidor).

Con Ollama, `OLLAMA_MODEL` tiene que ser el id exacto **con su tag**, tal como lo
devuelve el propio servidor. Si no coincide, los cotejos funcionan pero la
interfaz enseña el punto rojo para siempre:

```bash
curl -s http://127.0.0.1:11434/v1/models | jq -r '.data[].id'
```
Los identificadores de OpenRouter se copian de su catálogo, por ejemplo
`anthropic/claude-sonnet-4.5` o un identificador que termine en `:free` cuando esté
disponible. La clave API solo vive en el servidor y nunca se envía al navegador.

`OPENROUTER_SITE_URL` y `OPENROUTER_APP_NAME` son metadatos opcionales de
atribución. No pongas la clave en archivos de `src/` ni en HTML.

## Mantenimiento

Después de cambiar cualquier archivo de `src/` o las páginas HTML de la raíz hay
que recompilar. En el servidor lo hace `deploy.sh` en el orden correcto:

```bash
npm run build                 # desarrollo
sudo ./scripts/deploy.sh      # servidor: pull + build + reinicio
```

Consultar el expediente sin abrir el navegador:

```bash
sqlite3 data/cases.db "SELECT case_no, pi_name, proposal_title, verdict, signed_at FROM cases ORDER BY created_at DESC;"
```

## Despliegue en un servidor

Un servidor Ubuntu recién instalado, sin nada encima. El script instala Node,
Ollama, el código y los servicios de systemd, y deja todo arrancando solo tras un
reinicio.

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone <url-del-repo> /opt/research-paper-checker
sudo /opt/research-paper-checker/scripts/provision.sh
```

Si el repositorio es privado y el servidor no tiene credenciales, copia tu
checkout y clona desde ahí:

```bash
rsync -a --exclude node_modules --exclude .env --exclude dist ./ /tmp/rpc-src/
sudo /tmp/rpc-src/scripts/provision.sh --source /tmp/rpc-src
```

Antes de tocar nada, `--dry-run` enseña cada acción. Opciones útiles:
`--localhost` (no abrir a la red), `--model TAG` (forzar el modelo),
`--skip-model` (Ollama sin descargar nada), `--help` para el resto.

El script es idempotente: volver a correrlo no reinstala nada, repara permisos y
no toca un `.env` que ya exista.

### Qué queda instalado

| | |
|---|---|
| Código | `/opt/research-paper-checker`, `root:rpchecker` 0750 |
| Expediente | `.../data`, `rpchecker:rpchecker` 2770 — el único camino escribible |
| Configuración | `.../.env`, `root:rpchecker` 0640 |
| Servicio | `research-paper-checker.service` |
| Modelo | `ollama.service` en `127.0.0.1:11434`, nunca expuesto |

El modelo por defecto se escoge según la RAM detectada (de `llama3.2:3b` con menos
de 8 GB hasta `gpt-oss:120b` con 64 GB o más). Con menos de 8 GB el aviso es serio:
los modelos que caben fallan a menudo al devolver el JSON estricto que el cotejo
necesita.

### Operación

```bash
./scripts/status.sh                  # qué está bien y qué no
./scripts/status.sh --check          # igual, pero sale != 0 (para cron o CI)
journalctl -u research-paper-checker -f
sudo systemctl restart research-paper-checker
sudo ./scripts/deploy.sh             # actualizar: pull, build y reinicio en orden
sudo ./scripts/deploy.sh --rollback  # volver al build y al commit anteriores
```

`deploy.sh` compila a un directorio aparte y lo intercambia de golpe. Es a
propósito: el servidor decide si sirve las páginas **una sola vez al arrancar**,
así que un build a medias dejaría la aplicación respondiendo solo `/api` hasta el
siguiente reinicio.

### Respaldo

`data/` es el récord de cumplimiento y lo único que no se puede reconstruir desde
git. La base está en modo WAL, así que se copia con el servicio parado:

```bash
sudo systemctl stop research-paper-checker
sudo tar czf /var/backups/rpc-$(date +%F).tgz -C /opt/research-paper-checker data .env
sudo systemctl start research-paper-checker
```

### Si el cotejo devuelve "El modelo no devolvió JSON válido"

Lo primero que hay que mirar es el tamaño del contexto de Ollama. Por defecto son
4096 tokens: una propuesta entera lo desborda **en silencio**, el prompt se trunca
y el modelo devuelve algo que no es JSON. `deploy/ollama.service.d/override.conf`
lo sube a 16384; si tus propuestas son más largas, súbelo más.

## Límites conocidos

- La **lista oficial de entidades de preocupación** aún no se publica. El cotejo
  IROC señala afiliaciones extranjeras para que un humano las verifique contra
  esa lista cuando salga; no la sustituye.
- El modelo puede equivocarse en ambas direcciones. El prompt está escrito
  para ser conservador (señalar en vez de despachar), pero un veredicto de
  "sin hallazgos" no exime al PI de su atestación.
- No hay control de acceso: quien alcance el puerto puede emitir certificados y
  leer cualquier propuesta guardada. Con `HOST=0.0.0.0` eso es toda la red local.
  El servicio corre bajo una cuenta dedicada (`rpchecker`) y `ufw` limita el
  puerto a rangos privados, pero ninguna de las dos cosas es autenticación.
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

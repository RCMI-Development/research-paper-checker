# Expediente de Cumplimiento — DGOF / IROC / DEI

Aplicación local para el cotejo preliminar de propuestas de investigación conforme a la política federal de julio de 2026 (EO 14292). La interfaz usa React y Vite; el backend, la base de datos, los archivos y el expediente auditable son administrados por Django.

El texto de la propuesta se mantiene en la computadora donde corren Django y LM Studio. **El cotejo es una ayuda de triaje, no una certificación.** La certificación sigue siendo un acto humano del ICDGOF.

## Arquitectura

El sitio tiene dos niveles antes del cotejo: `index.html` es el portal de agentes de IA del
Recinto y lista los decanatos; `dec-invest.html` es la página del Decanato de Investigación y
lanza los tres cotejos. Ambas usan la identidad institucional RCM-UPR, definida una sola vez
en `src/rcm.css` y compartida con las páginas React.

- **Interfaz:** React 18 + Vite
- **Backend:** Django 5.2 LTS + Django REST Framework
- **Base de datos local:** `data/django.sqlite3`
- **Producción multiusuario:** PostgreSQL mediante `DATABASE_URL`
- **Documentos privados:** `data/uploads/`
- **Inferencia:** LM Studio en `localhost:1234`
- **Administración:** Django Admin en `http://localhost:4000/admin/`

Django almacena casos, documentos, cada ejecución de DEI/DGOF/IROC, certificaciones y eventos de auditoría por separado. Abrir los tres cotejos desde el índice reserva un solo número de expediente compartido.

## Requisitos

- Node.js 22.12 o posterior
- [uv](https://docs.astral.sh/uv/) para Python y dependencias
- [LM Studio](https://lmstudio.ai) con al menos un modelo de chat descargado

`uv` instala automáticamente una versión compatible de Python 3.12 y las dependencias declaradas en `pyproject.toml`.

## Instalación inicial

La forma más corta, que verifica requisitos, crea `.env`, instala todo y migra la base de datos:

```bash
./scripts/setup.sh
```

Equivale a hacerlo a mano:

```bash
cd ~/dgof-iroc-screener
sudo apt install npm
npm install
uv sync
npm run migrate
```

Si existe la base de datos del prototipo Node (`data/cases.db`), impórtala una vez:

```bash
npm run import:legacy
```

El importador es idempotente: se puede volver a ejecutar sin duplicar casos ni cotejos.

## Uso local

1. En LM Studio, abre **Developer → Local Server** y prende el servidor.
2. Ejecuta:

   ```bash
   ./scripts/start.sh
   ```

   El guion avisa si LM Studio está apagado, aplica migraciones pendientes y
   levanta Django y Vite juntos. `npm run dev` hace lo mismo sin las verificaciones.

3. Abre `http://localhost:5173`. Cae en el portal institucional.
4. Entra a **Decanato de Investigación** (`/dec-invest.html`).
5. Escoge DEI, DGOF o IROC, o usa **Abrir los tres a la vez** para compartir un expediente.
6. Pega el texto o adjunta un PDF, TXT o Markdown de hasta 25 MB.
7. Revisa el informe. Solo los cotejos sin hallazgos permiten una certificación humana.

`npm run dev` levanta Django en el puerto 4000 y Vite en el 5173. Vite redirige `/api` a Django.

Para verificar que todos los servicios respondan:

```bash
./scripts/status.sh
```

**Guía completa de operación, despliegue en servidor y resolución de problemas: [`docs/RUNNING.md`](docs/RUNNING.md).**

## Base de datos y administración

Aplica nuevas migraciones con:

```bash
npm run migrate
```

Crea una cuenta administrativa:

```bash
uv run python backend/manage.py createsuperuser
```

Luego abre `http://localhost:4000/admin/`. Desde allí se pueden buscar casos, asignar revisores y examinar documentos, cotejos, certificaciones y eventos de auditoría. Los informes de los modelos se guardan como JSON estructurado y cada nueva evaluación conserva su propia versión.

## Autenticación

El modo local mantiene compatibilidad con el prototipo y no exige inicio de sesión:

```env
REQUIRE_AUTH=false
```

Para una instalación compartida usa `REQUIRE_AUTH=true`. El API exigirá una sesión de Django y la protección CSRF. Las certificaciones autenticadas requieren el permiso Django `screener.add_certification`; los superusuarios ya lo tienen.

## PostgreSQL

Para una instalación central, crea la base de datos y configura:

```env
DATABASE_URL=postgresql://usuario:contraseña@servidor:5432/dgof_iroc
REQUIRE_AUTH=true
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=una-clave-larga-aleatoria
DJANGO_ALLOWED_HOSTS=cotejo.ejemplo.edu
```

Después ejecuta `npm run migrate`. La terminación TLS, los límites de carga, las copias de seguridad y el acceso privado a archivos deben configurarse en el proxy o plataforma institucional.

## LM Studio y privacidad

`localhost` se interpreta desde el proceso de Django. Si Django se instala en un servidor central, LM Studio también debe correr allí o estar disponible mediante una dirección privada configurada en `LM_STUDIO_URL`. Un LM Studio abierto solamente en la computadora del navegador no será visible para un Django remoto.

## Configuración

Variables principales de `.env`:

```env
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=qwen/qwen3-30b-a3b-2507
LM_STUDIO_TIMEOUT=180
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
REQUIRE_AUTH=false
```

Consulta `.env.example` para el conjunto completo.

## API compatible

| Ruta | Función |
|---|---|
| `GET /api/health` | Estado y modelos disponibles en LM Studio |
| `GET /api/case-number` | Reserva transaccionalmente un expediente |
| `POST /api/extract` | Guarda un documento y extrae su texto |
| `POST /api/evaluate` | Ejecuta y persiste cotejos DGOF/IROC |
| `POST /api/cases` | Guarda DEI o certifica un cotejo existente |
| `GET /api/cases` | Lista resumida de expedientes |
| `GET /api/cases/:caseNo` | Detalle y últimos informes del expediente |

## Verificación

```bash
npm run test:backend
npm run build
npm audit
uv run python backend/manage.py check
```

Las pruebas cubren reserva de casos, cargas privadas, persistencia de resultados, certificación, estados combinados, detalle del expediente e importación idempotente del SQLite anterior.

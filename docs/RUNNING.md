# Running the screener

A practical runbook: what has to be running, how to install it, how to start it,
and what to do when something is broken.

If you only read one thing:

```bash
./scripts/setup.sh    # once, per machine
./scripts/start.sh    # every time you want to use the app
./scripts/status.sh   # when something looks wrong
```

---

## 1. What actually runs

Four things. Only three of them are processes you start, and one is optional.

| # | Service | Port | Who starts it | Required? |
|---|---|---|---|---|
| 1 | **LM Studio** local server — runs the language model | `1234` | You, in the LM Studio app | **Yes.** Screenings fail without it. |
| 2 | **Django** — API, database, files, audit trail, admin | `4000` | `./scripts/start.sh` | **Yes.** |
| 3 | **Vite** — dev server for the React frontend | `5173` | `./scripts/start.sh` | Development only. Not used on a server. |
| 4 | **PostgreSQL** | `5432` | Your server | Only for a shared multi-user install. Local installs use SQLite. |

How they talk to each other:

```
Browser  ──▶  Vite :5173  ──/api──▶  Django :4000  ──▶  LM Studio :1234
                                          │
                                          ├──▶  data/django.sqlite3   (cases, screenings, audit)
                                          └──▶  data/uploads/         (uploaded PDFs)
```

Two things people get wrong here:

- **You open `:5173`, not `:4000`.** Django has no frontend; it only answers
  `/api` and `/admin`. Vite serves the pages and forwards `/api` to Django.
- **`localhost:1234` is resolved from Django's machine, not the browser's.**
  If Django runs on a server, LM Studio has to run on that same server (or be
  reachable at a private address you set in `LM_STUDIO_URL`). LM Studio running
  on your laptop is invisible to a remote Django.

---

## 2. Install (once per machine)

**Prerequisites**

- Node.js 22.12 or newer — <https://nodejs.org>
- `uv` — `curl -LsSf https://astral.sh/uv/install.sh | sh`
  (it installs Python 3.12 and every Python dependency for you)
- LM Studio with at least one chat model downloaded — <https://lmstudio.ai>

**Then**

```bash
git clone <repo-url> dgof-iroc-screener
cd dgof-iroc-screener
./scripts/setup.sh
```

`setup.sh` checks your Node and `uv` versions, installs both dependency sets,
creates `.env` from `.env.example` with a freshly generated `DJANGO_SECRET_KEY`,
creates `data/uploads/`, applies database migrations, and — if it finds the old
Node prototype database at `data/cases.db` — imports it. It is safe to re-run:
it never overwrites an existing `.env` and the legacy import does not duplicate
cases.

**One thing to check by hand.** Open `.env` and make sure `LM_STUDIO_MODEL`
matches a model you actually have:

```env
LM_STUDIO_MODEL=qwen/qwen3-30b-a3b-2507
```

The exact model identifier is shown in LM Studio, and `./scripts/status.sh`
prints how many models the server currently has loaded.

**Optional — create an admin account** so you can browse cases, assign
reviewers, and read the audit trail at <http://localhost:4000/admin/>:

```bash
uv run python backend/manage.py createsuperuser
```

---

## 3. Start it (every day)

1. Open LM Studio → **Developer → Local Server** → **Start**.
   (Headless server? `lms server start` does the same from a terminal.)
2. Run:

   ```bash
   ./scripts/start.sh
   ```

3. Open <http://localhost:5173>. That is the institutional portal; the screeners
   live one level down, under **Decanato de Investigación** (`/dec-invest.html`).

`start.sh` pings LM Studio first and warns you loudly if it is off, applies any
pending migrations, then starts Django and Vite together in one terminal, with
colour-coded output per service. **Ctrl+C stops both.**

---

## 4. Check that everything is up

```bash
./scripts/status.sh
```

It reports each service, your configuration, and — most usefully — whether
Django can actually reach LM Studio end to end:

```
==> Service status
  UP   LM Studio        http://localhost:1234/v1  (1 model(s) loaded)
  UP   Django API       http://localhost:4000
  UP   Vite (frontend)  http://localhost:5173

==> Configuration
  ok  .env present
  ok  node_modules present
  ok  database migrations up to date

==> End-to-end check
  UP   Django can talk to LM Studio. The app is fully operational.
```

---

## 5. Everyday commands

| Command | What it does |
|---|---|
| `./scripts/start.sh` | Start everything for development |
| `./scripts/start.sh --prod` | Build the frontend, run Django on `0.0.0.0:4000` |
| `./scripts/status.sh` | Check every service and the LM Studio connection |
| `npm run migrate` | Apply new database migrations after a `git pull` |
| `npm run build` | Build the frontend into `dist/` |
| `npm run test:backend` | Run the backend test suite |
| `npm run import:legacy` | Re-import the old `data/cases.db` (idempotent) |
| `uv run python backend/manage.py createsuperuser` | Create an admin account |
| `uv run python backend/manage.py check` | Django configuration sanity check |

**After pulling new code:**

```bash
git pull && npm install && uv sync && npm run migrate
```

---

## 6. Running on a server

The development flow above uses Vite to serve the pages. On a server there is no
Vite: you build the frontend once into `dist/`, and a web server serves those
files and forwards `/api` and `/admin` to Django.

### 6.1 Configure `.env`

```env
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<a long random string>
DJANGO_ALLOWED_HOSTS=cotejo.ejemplo.edu
REQUIRE_AUTH=true
SECURE_SSL_REDIRECT=false        # see the warning below

DATABASE_URL=postgresql://user:password@localhost:5432/dgof_iroc

LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=qwen/qwen3-30b-a3b-2507
```

Generate a secret key with:

```bash
uv run python -c 'import secrets; print(secrets.token_urlsafe(64))'
```

> **Read this before you set `DJANGO_DEBUG=false`.** Doing so turns on
> `SECURE_SSL_REDIRECT` by default, and this project does not configure
> `SECURE_PROXY_SSL_HEADER`. If your proxy terminates TLS and forwards plain
> HTTP to Django, Django will not see the original `https://` and will redirect
> forever. Set `SECURE_SSL_REDIRECT=false` and let the proxy handle the
> HTTP → HTTPS redirect. Your proxy should still serve HTTPS to users.

With `REQUIRE_AUTH=true` the API requires a Django session and CSRF protection.
Users sign in at `/admin/`. Signing a certification additionally requires the
`screener.add_certification` permission; superusers already have it.

### 6.2 Deploy

```bash
./scripts/setup.sh          # installs deps, migrates (now against PostgreSQL)
npm run build               # produces dist/
```

### 6.3 Put a web server in front

**Caddy** (`/etc/caddy/Caddyfile`) — HTTPS is automatic:

```
cotejo.ejemplo.edu {
    handle /api/*   { reverse_proxy 127.0.0.1:4000 }
    handle /admin/* { reverse_proxy 127.0.0.1:4000 }
    handle /static/* { reverse_proxy 127.0.0.1:4000 }
    handle { root * /opt/dgof-iroc-screener/dist
             try_files {path} {path}.html /index.html
             file_server }
}
```

**nginx** equivalent:

```nginx
server {
    server_name cotejo.ejemplo.edu;
    client_max_body_size 26M;          # uploads are capped at 25 MB

    root /opt/dgof-iroc-screener/dist;
    location / { try_files $uri $uri.html /index.html; }

    location ~ ^/(api|admin|static)/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # /api/evaluate/stream informa el progreso del cotejo por SSE.
        # Sin esto nginx acumula el stream y el progreso llega todo junto
        # al final, que es exactamente lo que se quería evitar.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

Caddy pasa los eventos sin acumularlos y no necesita configuración extra,
pero el cotejo puede tardar minutos: súbele el tiempo de espera si tu
`reverse_proxy` tiene uno más corto que `LM_STUDIO_TIMEOUT`.

`data/uploads/` is deliberately **not** served by the web server. Uploaded
proposals must only ever be reachable through Django, which checks permissions.
Do not add a `location` block for it.

### 6.4 Keep it running with systemd

Django — `/etc/systemd/system/screener.service`:

```ini
[Unit]
Description=DGOF/IROC screener backend
After=network.target

[Service]
User=screener
WorkingDirectory=/opt/dgof-iroc-screener
ExecStart=/usr/local/bin/uv run python backend/manage.py runserver 0.0.0.0:4000
Restart=always

[Install]
WantedBy=multi-user.target
```

LM Studio — `/etc/systemd/system/lmstudio.service`:

```ini
[Unit]
Description=LM Studio local inference server
After=network.target

[Service]
User=screener
ExecStart=/usr/local/bin/lms server start --port 1234
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lmstudio screener
sudo systemctl status screener
```

> `manage.py runserver` is Django's **development** server: single-threaded and
> not built for concurrent users. It is fine for a small internal deployment. If
> more than a handful of people will use this at once, add `gunicorn` to
> `pyproject.toml` and change `ExecStart` to
> `uv run gunicorn config.wsgi:application --bind 0.0.0.0:4000 --workers 3`,
> and run `uv run python backend/manage.py collectstatic` for the admin's CSS
> (which needs `STATIC_ROOT` added to `backend/config/settings.py` first).

### 6.5 Back up

Three things matter, and all three must be backed up together — a database
without its files is not a usable record:

- the database (`data/django.sqlite3`, or your PostgreSQL dump)
- `data/uploads/` — the uploaded proposals
- `.env` — store this somewhere secret; it holds your secret key and DB password

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Page says the model is unreachable | LM Studio server is off | LM Studio → Developer → Local Server → Start, or `lms server start` |
| Screening hangs, then times out | Model is large and slow | Raise `LM_STUDIO_TIMEOUT` in `.env`, or load a smaller model |
| `404` on every `/api` call | Django is not running | `./scripts/status.sh`, then `./scripts/start.sh` |
| Blank page at `http://localhost:4000` | Expected — Django has no frontend | Open `http://localhost:5173` instead |
| `Port 4000 already in use` | An old Django is still running | `lsof -ti:4000 \| xargs kill` |
| `Port 5173 already in use` | An old Vite is still running | `lsof -ti:5173 \| xargs kill` |
| `no such table` errors | Migrations not applied | `npm run migrate` |
| `DisallowedHost` on the server | Hostname missing from config | Add it to `DJANGO_ALLOWED_HOSTS` in `.env`, restart |
| Endless HTTPS redirect loop | `DEBUG=false` with TLS at the proxy | Set `SECURE_SSL_REDIRECT=false` (see §6.1) |
| `CSRF verification failed` on the server | Origin not trusted | Add `CSRF_TRUSTED_ORIGINS = ["https://your.host"]` to `backend/config/settings.py` |
| Upload rejected | File over 25 MB, or wrong type | Only PDF, TXT and MD are accepted, up to 25 MB |
| `uv: command not found` in systemd | systemd has a minimal `PATH` | Use the absolute path to `uv` in `ExecStart` |

Still stuck? Ask Django directly:

```bash
curl -s http://localhost:4000/api/health | python3 -m json.tool
uv run python backend/manage.py check
```

`/api/health` reports whether LM Studio is reachable and which models it sees.

---

## 8. Known quirks

Small things that will confuse you if nobody warns you:

- **`API_PORT` in `.env` does nothing.** Port 4000 is hardcoded in two places:
  `package.json` (the `backend` script) and `vite.config.js` (the proxy target).
  To change it, edit both.
- **Django never serves the frontend.** There is no `STATIC_ROOT` and no
  static-file middleware, so in production a separate web server must serve
  `dist/`. That is why §6.3 exists.
- **The three screeners share one case number** when you open them from the
  Decanato de Investigación page (`/dec-invest.html`) with *Abrir los tres a la vez*.
- **The screening is triage, not certification.** Certification stays a human
  act by the ICDGOF, and only screenings with no findings can be certified.

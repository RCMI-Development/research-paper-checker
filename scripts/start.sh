#!/usr/bin/env bash
# Start the screener.
#   ./scripts/start.sh          development: Django (4000) + Vite (5173), hot reload
#   ./scripts/start.sh --prod   server: build the frontend, run Django on 0.0.0.0:4000
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="dev"
[ "${1:-}" = "--prod" ] && MODE="prod"

info() { printf '\033[34m==>\033[0m %s\n' "$1"; }
ok()   { printf '\033[32m  ok\033[0m %s\n' "$1"; }
warn() { printf '\033[33m  !!\033[0m %s\n' "$1"; }
fail() { printf '\033[31m  xx\033[0m %s\n' "$1" >&2; exit 1; }

[ -f .env ]           || fail "No .env found. Run ./scripts/setup.sh first."
[ -d node_modules ]   || fail "No node_modules. Run ./scripts/setup.sh first."

# Read LM_STUDIO_URL out of .env without sourcing the whole file.
LM_URL="$(grep -E '^LM_STUDIO_URL=' .env | tail -1 | cut -d= -f2- || true)"
LM_URL="${LM_URL:-http://localhost:1234/v1}"

info "Checking LM Studio at ${LM_URL}"
if curl -fsS --max-time 5 "${LM_URL}/models" >/dev/null 2>&1; then
  ok "LM Studio is reachable"
else
  warn "LM Studio is NOT reachable at ${LM_URL}"
  warn "The app will start, but screenings will fail until you turn on"
  warn "LM Studio -> Developer -> Local Server (or run: lms server start)."
fi

info "Checking for pending migrations"
if ! uv run python backend/manage.py migrate --check >/dev/null 2>&1; then
  info "Applying migrations"
  uv run python backend/manage.py migrate
fi
ok "database up to date"

if [ "$MODE" = "prod" ]; then
  info "Building the frontend into dist/"
  npm run build
  ok "dist/ ready"
  echo
  warn "Django serves /api and /admin only. Your reverse proxy (nginx, Caddy)"
  warn "must serve dist/ and forward /api and /admin to 127.0.0.1:4000."
  warn "See docs/RUNNING.md, section 'Running on a server'."
  echo
  info "Starting Django on 0.0.0.0:4000"
  exec uv run python backend/manage.py runserver 0.0.0.0:4000
fi

echo
info "Starting Django (4000) and Vite (5173). Open http://localhost:5173"
info "Press Ctrl+C to stop both."
echo
exec npm run dev

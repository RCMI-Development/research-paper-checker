#!/usr/bin/env bash
# Start the checker.
#   ./scripts/start.sh          development: API (4000) + Vite (5173), hot reload
#   ./scripts/start.sh --prod   server: build the frontend, run the API only
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="dev"
[ "${1:-}" = "--prod" ] && MODE="prod"

info() { printf '\033[34m==>\033[0m %s\n' "$1"; }
ok()   { printf '\033[32m  ok\033[0m %s\n' "$1"; }
warn() { printf '\033[33m  !!\033[0m %s\n' "$1"; }
fail() { printf '\033[31m  xx\033[0m %s\n' "$1" >&2; exit 1; }

[ -f .env ]         || fail "No .env found. Run ./scripts/setup.sh first."
[ -d node_modules ] || fail "No node_modules. Run ./scripts/setup.sh first."

# Read config out of .env without sourcing the whole file.
env_get() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }

# LM Studio pretty-prints its JSON ("id": "x"), so strip whitespace before matching.
model_ids() { printf '%s' "$1" | tr -d ' \n\t' | grep -o '"id":"[^"]*"' | cut -d'"' -f4; }

LM_URL="$(env_get LM_STUDIO_URL)"; LM_URL="${LM_URL:-http://localhost:1234/v1}"
LM_MODEL="$(env_get LM_STUDIO_MODEL)"
API_PORT="$(env_get API_PORT)"; API_PORT="${API_PORT:-4000}"

info "Checking LM Studio at ${LM_URL}"
if MODELS="$(curl -fsS --max-time 5 "${LM_URL}/models" 2>/dev/null)"; then
  ok "LM Studio is reachable"
  if [ -n "$LM_MODEL" ] && ! model_ids "$MODELS" | grep -qxF "$LM_MODEL"; then
    warn "LM_STUDIO_MODEL=${LM_MODEL} is not among the loaded models."
    warn "Load it in LM Studio, or change LM_STUDIO_MODEL in .env. Loaded now:"
    model_ids "$MODELS" | sed 's/^/       /'
  fi
else
  warn "LM Studio is NOT reachable at ${LM_URL}"
  warn "The app will start, but evaluations will fail until you turn on"
  warn "LM Studio -> Developer -> Local Server (or run: lms server start)."
fi

if lsof -nP -iTCP:"${API_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "Port ${API_PORT} is already in use. Another instance is probably running.
       See it with:  lsof -nP -iTCP:${API_PORT} -sTCP:LISTEN"
fi

if [ "$MODE" = "prod" ]; then
  info "Building the frontend into dist/"
  npm run build
  ok "dist/ ready"
  echo
  warn "The API serves /api only. Your reverse proxy (nginx, Caddy) must serve"
  warn "dist/ and forward /api to 127.0.0.1:${API_PORT}."
  echo
  info "Starting the API on port ${API_PORT}"
  exec npm run server
fi

echo
info "Starting the API (${API_PORT}) and Vite (5173). Open http://localhost:5173"
info "Press Ctrl+C to stop both."
echo
exec npm run dev

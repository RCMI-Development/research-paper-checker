#!/usr/bin/env bash
# Start the checker.
#   ./scripts/start.sh            development: API (4000) + Vite (5173), hot reload
#   ./scripts/start.sh --detach   same, but detached: survives closing the terminal
#   ./scripts/start.sh --prod     server: build the frontend, run the API only
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="dev"
case "${1:-}" in
  --prod)   MODE="prod" ;;
  --detach) MODE="detach" ;;
  "")       ;;
  *)        echo "Unknown option: $1" >&2; exit 1 ;;
esac

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

# lsof is not installed everywhere; fall back to ss, which is in iproute2.
port_busy() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    ss -tln 2>/dev/null | grep -qE "[:.]$1[[:space:]]"
  fi
}

LM_URL="$(env_get LM_STUDIO_URL)"; LM_URL="${LM_URL:-http://localhost:1234/v1}"
LM_MODEL="$(env_get LM_STUDIO_MODEL)"
API_PORT="$(env_get API_PORT)"; API_PORT="${API_PORT:-4000}"
WEB_PORT=5173

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

if [ "$MODE" = "prod" ]; then
  if port_busy "$API_PORT"; then
    fail "Port ${API_PORT} is already in use. Stop the other instance first:
       ./scripts/status.sh   shows what is running"
  fi
  info "Building the frontend into dist/"
  npm run build
  ok "dist/ ready"
  echo
  warn "The API serves /api only. Your reverse proxy (nginx, Caddy, cloudflared)"
  warn "must serve dist/ and forward /api to 127.0.0.1:${API_PORT}."
  echo
  info "Starting the API on port ${API_PORT}"
  exec npm run start
fi

# Both ports must be free. Starting a second Vite while one already holds 5173
# wipes node_modules/.vite/deps during startup and then dies on "port in use",
# which leaves the *running* server serving module URLs for chunks that no
# longer exist: the pages load but React never mounts, so every page is blank.
for p in "$API_PORT" "$WEB_PORT"; do
  if port_busy "$p"; then
    fail "Port ${p} is already in use. Another instance is probably running.
       Inspect it with:  ./scripts/status.sh
       Stop it with:     pkill -f server/index.js; pkill -f node_modules/.bin/vite"
  fi
done

# Cheap insurance against a half-written optimizer cache left by a previous
# crash. Vite rebuilds it on boot, which costs about a second.
rm -rf node_modules/.vite

if [ "$MODE" = "detach" ]; then
  mkdir -p logs
  info "Starting detached. API (${API_PORT}) + Vite (${WEB_PORT})."
  nohup npm run dev > logs/dev.log 2>&1 &
  sleep 8
  if curl -fsS --max-time 5 "http://localhost:${WEB_PORT}/" >/dev/null 2>&1; then
    ok "Running in the background. Log: logs/dev.log"
    ok "Open http://localhost:${WEB_PORT}"
    echo
    info "Stop it with:   pkill -f server/index.js; pkill -f node_modules/.bin/vite"
    info "Check it with:  ./scripts/status.sh"
  else
    fail "It did not come up. Last lines of logs/dev.log:
$(tail -15 logs/dev.log 2>/dev/null)"
  fi
  exit 0
fi

echo
info "Starting the API (${API_PORT}) and Vite (${WEB_PORT}). Open http://localhost:${WEB_PORT}"
info "Press Ctrl+C to stop both."
echo
exec npm run dev

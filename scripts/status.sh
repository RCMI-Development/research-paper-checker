#!/usr/bin/env bash
# Check every moving part. Answers: "why isn't it working?"
set -uo pipefail

cd "$(dirname "$0")/.."

ok()   { printf '\033[32m  UP  \033[0m %s\n' "$1"; }
down() { printf '\033[31m DOWN \033[0m %s\n' "$1"; }
good() { printf '\033[32m  ok  \033[0m %s\n' "$1"; }
bad()  { printf '\033[31m  xx  \033[0m %s\n' "$1"; }
note() { printf '\033[33m  --  \033[0m %s\n' "$1"; }

LM_URL="$(grep -E '^LM_STUDIO_URL=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
LM_URL="${LM_URL:-http://localhost:1234/v1}"

printf '\033[34m==>\033[0m Service status\n'

if curl -fsS --max-time 5 "${LM_URL}/models" >/dev/null 2>&1; then
  COUNT="$(curl -fsS --max-time 5 "${LM_URL}/models" | grep -o '"id"' | wc -l | tr -d ' ')"
  ok "LM Studio        ${LM_URL}  (${COUNT} model(s) loaded)"
else
  down "LM Studio        ${LM_URL}  -> turn on Developer > Local Server"
fi

if curl -fsS --max-time 5 http://localhost:4000/api/health >/dev/null 2>&1; then
  ok "Django API       http://localhost:4000"
else
  down "Django API       http://localhost:4000  -> run ./scripts/start.sh"
fi

if curl -fsS --max-time 5 http://localhost:5173 >/dev/null 2>&1; then
  ok "Vite (frontend)  http://localhost:5173"
else
  note "Vite (frontend)  http://localhost:5173  -> dev only; not used in --prod mode"
fi

printf '\n\033[34m==>\033[0m Configuration\n'
[ -f .env ] && good ".env present" || bad ".env missing -> run ./scripts/setup.sh"
[ -d node_modules ] && good "node_modules present" || bad "node_modules missing -> run ./scripts/setup.sh"

if uv run python backend/manage.py migrate --check >/dev/null 2>&1; then
  good "database migrations up to date"
else
  bad "pending migrations -> run npm run migrate"
fi

printf '\n\033[34m==>\033[0m End-to-end check\n'
HEALTH="$(curl -fsS --max-time 10 http://localhost:4000/api/health 2>/dev/null || true)"
if [ -z "$HEALTH" ]; then
  down "Django is not answering, so it cannot be checked against LM Studio."
elif printf '%s' "$HEALTH" | grep -q '"reachable":true'; then
  ok "Django can talk to LM Studio. The app is fully operational."
else
  down "Django is up but cannot reach LM Studio:"
  printf '       %s\n' "$HEALTH"
fi

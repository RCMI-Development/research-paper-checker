#!/usr/bin/env bash
# Check every moving part. Answers: "why isn't it working?"
set -uo pipefail

cd "$(dirname "$0")/.."

ok()   { printf '\033[32m  UP  \033[0m %s\n' "$1"; }
down() { printf '\033[31m DOWN \033[0m %s\n' "$1"; }
good() { printf '\033[32m  ok  \033[0m %s\n' "$1"; }
bad()  { printf '\033[31m  xx  \033[0m %s\n' "$1"; }
note() { printf '\033[33m  --  \033[0m %s\n' "$1"; }

env_get() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }

# LM Studio pretty-prints its JSON ("id": "x"), so strip whitespace before matching.
model_ids() { printf '%s' "$1" | tr -d ' \n\t' | grep -o '"id":"[^"]*"' | cut -d'"' -f4; }

LM_URL="$(env_get LM_STUDIO_URL)"; LM_URL="${LM_URL:-http://localhost:1234/v1}"
LM_MODEL="$(env_get LM_STUDIO_MODEL)"
AI_PROVIDER="$(env_get AI_PROVIDER)"; AI_PROVIDER="${AI_PROVIDER:-lmstudio}"
API_PORT="$(env_get API_PORT)"; API_PORT="${API_PORT:-4000}"
API_URL="http://localhost:${API_PORT}"

printf '\033[34m==>\033[0m Service status\n'

if [ "$AI_PROVIDER" = "openrouter" ]; then
  PROVIDER_LABEL="OpenRouter"
  PROVIDER_URL="$(env_get OPENROUTER_URL)"; PROVIDER_URL="${PROVIDER_URL:-https://openrouter.ai/api/v1}"
  PROVIDER_MODEL="$(env_get OPENROUTER_MODEL)"; PROVIDER_MODEL="${PROVIDER_MODEL:-openai/gpt-oss-20b}"
  PROVIDER_KEY="$(env_get OPENROUTER_API_KEY)"
  MODELS=""
  if [ -n "$PROVIDER_KEY" ]; then
    MODELS="$(curl -fsS --max-time 10 -H "Authorization: Bearer ${PROVIDER_KEY}" "${PROVIDER_URL}/models" 2>/dev/null)"
  fi
else
  PROVIDER_LABEL="LM Studio"
  PROVIDER_URL="$LM_URL"
  PROVIDER_MODEL="$LM_MODEL"
  MODELS="$(curl -fsS --max-time 5 "${PROVIDER_URL}/models" 2>/dev/null)"
fi
if [ -n "$MODELS" ]; then
  COUNT="$(model_ids "$MODELS" | wc -l | tr -d ' ')"
  ok "${PROVIDER_LABEL}        ${PROVIDER_URL}  (${COUNT} model(s) available)"
else
  down "${PROVIDER_LABEL}        ${PROVIDER_URL}  -> check provider configuration"
fi

if curl -fsS --max-time 5 "${API_URL}/api/health" >/dev/null 2>&1; then
  ok "API              ${API_URL}"
else
  down "API              ${API_URL}  -> run ./scripts/start.sh"
fi

if curl -fsS --max-time 5 http://localhost:5173 >/dev/null 2>&1; then
  ok "Vite (frontend)  http://localhost:5173"
else
  note "Vite (frontend)  http://localhost:5173  -> dev only; not used in --prod mode"
fi

printf '\n\033[34m==>\033[0m Configuration\n'
[ -f .env ] && good ".env present" || bad ".env missing -> run ./scripts/setup.sh"
[ -d node_modules ] && good "node_modules present" || bad "node_modules missing -> run ./scripts/setup.sh"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -ge 22 ] && node --input-type=module \
     -e 'import("node:sqlite").then(()=>process.exit(0),()=>process.exit(1))' >/dev/null 2>&1; then
  good "node $(node -v) with node:sqlite"
else
  bad "node $(node -v 2>/dev/null || echo 'missing') cannot use node:sqlite -> need 22.13+ or 24 LTS"
fi

if [ -f data/cases.db ]; then
  CASES="$(node --input-type=module -e '
    import db from "./server/db.js";
    console.log(db.prepare("SELECT COUNT(*) AS n FROM cases").get().n);
  ' 2>/dev/null || echo "?")"
  good "database data/cases.db (${CASES} case(s))"
else
  note "database data/cases.db not created yet -> it appears on first run"
fi

if [ -n "$MODELS" ] && [ -n "$PROVIDER_MODEL" ]; then
  if model_ids "$MODELS" | grep -qxF "$PROVIDER_MODEL"; then
    good "Configured model ${PROVIDER_MODEL} is available"
  else
    bad "Configured model ${PROVIDER_MODEL} is NOT available from ${PROVIDER_LABEL}."
  fi
fi

printf '\n\033[34m==>\033[0m End-to-end check\n'
HEALTH="$(curl -fsS --max-time 10 "${API_URL}/api/health" 2>/dev/null || true)"
if [ -z "$HEALTH" ]; then
  down "The API is not answering, so its model provider cannot be checked."
elif printf '%s' "$HEALTH" | grep -q '"reachable":true'; then
  ok "The API can talk to ${PROVIDER_LABEL}. The app is fully operational."
else
  down "The API is up but cannot reach ${PROVIDER_LABEL}:"
  printf '       %s\n' "$HEALTH"
fi

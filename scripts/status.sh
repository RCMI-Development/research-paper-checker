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
API_PORT="$(env_get API_PORT)"; API_PORT="${API_PORT:-4000}"
API_URL="http://localhost:${API_PORT}"
WEB_URL="http://localhost:5173"

printf '\033[34m==>\033[0m Service status\n'

MODELS="$(curl -fsS --max-time 5 "${LM_URL}/models" 2>/dev/null)"
if [ -n "$MODELS" ]; then
  COUNT="$(model_ids "$MODELS" | wc -l | tr -d ' ')"
  ok "LM Studio        ${LM_URL}  (${COUNT} model(s) loaded)"
else
  down "LM Studio        ${LM_URL}  -> turn on Developer > Local Server"
fi

if curl -fsS --max-time 5 "${API_URL}/api/health" >/dev/null 2>&1; then
  ok "API              ${API_URL}"
else
  down "API              ${API_URL}  -> run ./scripts/start.sh"
fi

if curl -fsS --max-time 5 "${WEB_URL}" >/dev/null 2>&1; then
  ok "Vite (frontend)  ${WEB_URL}"
else
  note "Vite (frontend)  ${WEB_URL}  -> dev only; not used in --prod mode"
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

if [ -n "$MODELS" ] && [ -n "$LM_MODEL" ]; then
  if model_ids "$MODELS" | grep -qxF "$LM_MODEL"; then
    good "LM_STUDIO_MODEL=${LM_MODEL} is loaded"
  else
    bad "LM_STUDIO_MODEL=${LM_MODEL} is NOT loaded in LM Studio. Loaded now:"
    model_ids "$MODELS" | sed 's/^/         /'
  fi
fi

# A blank page with a 200 status is the failure mode you get when Vite's
# dependency cache was wiped out from under a running server (usually by
# starting a second Vite on the same port). The HTML arrives, React 404s, and
# nothing mounts. Fetch a page's module graph and confirm React really loads.
printf '\n\033[34m==>\033[0m Frontend module graph\n'
if PAGE="$(curl -fsS --max-time 5 "${WEB_URL}/src/dgof.jsx" 2>/dev/null)"; then
  DEPS="$(printf '%s' "$PAGE" | grep -oE '"/node_modules/\.vite/deps/[^"]+"' | tr -d '"' | sort -u)"
  if [ -z "$DEPS" ]; then
    note "no optimised deps referenced (unusual, but not fatal)"
  else
    BROKEN=0
    while IFS= read -r dep; do
      CODE="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "${WEB_URL}${dep}")"
      [ "$CODE" = "200" ] || { bad "${dep%%\?*} -> HTTP ${CODE}"; BROKEN=1; }
    done <<< "$DEPS"
    if [ "$BROKEN" = "0" ]; then
      good "React and all optimised deps load (pages will render)"
    else
      bad "Stale dependency cache -> pages will be BLANK. Fix it with:"
      bad "  pkill -f node_modules/.bin/vite && rm -rf node_modules/.vite && ./scripts/start.sh"
    fi
  fi
else
  note "Vite is not serving; skipped"
fi

# Optional: only meaningful on the machine that publishes the site.
if command -v cloudflared >/dev/null 2>&1 && [ -f /etc/cloudflared/config.yml ]; then
  printf '\n\033[34m==>\033[0m Public tunnel\n'
  HOSTNAME_PUB="$(grep -E '^\s*-?\s*hostname:' /etc/cloudflared/config.yml | grep -v '^\s*#' | tail -1 | awk '{print $NF}')"
  if systemctl is-active --quiet cloudflared 2>/dev/null; then
    ok "cloudflared service"
  else
    down "cloudflared service  -> sudo systemctl start cloudflared"
  fi
  if grep -q "localhost:5173" /etc/cloudflared/config.yml 2>/dev/null; then
    good "ingress routes a hostname to :5173"
    if [ -n "$HOSTNAME_PUB" ]; then
      CODE="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "https://${HOSTNAME_PUB}/" 2>/dev/null || echo 000)"
      [ "$CODE" = "200" ] && ok "https://${HOSTNAME_PUB} -> ${CODE}" \
                          || bad "https://${HOSTNAME_PUB} -> ${CODE} (404 = hostname not in ingress)"
    fi
  else
    note "no ingress rule points at :5173 -> the public URL will 404"
  fi
fi

printf '\n\033[34m==>\033[0m End-to-end check\n'
HEALTH="$(curl -fsS --max-time 10 "${API_URL}/api/health" 2>/dev/null || true)"
if [ -z "$HEALTH" ]; then
  down "The API is not answering, so it cannot be checked against LM Studio."
elif printf '%s' "$HEALTH" | grep -q '"reachable":true'; then
  ok "The API can talk to LM Studio. The app is fully operational."
else
  down "The API is up but cannot reach LM Studio:"
  printf '       %s\n' "$HEALTH"
fi

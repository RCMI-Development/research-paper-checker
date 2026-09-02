#!/usr/bin/env bash
# Check every moving part. Answers: "why isn't it working?"
#   ./scripts/status.sh           informe completo
#   ./scripts/status.sh --check   igual, pero sale != 0 si algo está mal
set -uo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=lib.sh
. scripts/lib.sh

CHECK_MODE=0
[ "${1:-}" = "--check" ] && CHECK_MODE=1
PROBLEMS=0
problem() { PROBLEMS=$((PROBLEMS + 1)); }

provider_config
API_PORT="$(env_get API_PORT)"; API_PORT="${API_PORT:-4000}"
HOST_CFG="$(env_get HOST)"; HOST_CFG="${HOST_CFG:-127.0.0.1}"
API_URL="http://127.0.0.1:${API_PORT}"

# ── systemd ──────────────────────────────────────────────────────────────────
UNIT=research-paper-checker.service
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  printf '%s==>%s Servicios (systemd)\n' "$_BLUE" "$_OFF"
  for u in ollama.service "$UNIT"; do
    if [ -z "$(systemctl list-unit-files --no-legend "$u" 2>/dev/null)" ]; then
      note "$u no está instalado"
      continue
    fi
    STATE="$(systemctl is-active "$u" 2>/dev/null || true)"
    BOOT="$(systemctl is-enabled "$u" 2>/dev/null || echo '?')"
    if [ "$STATE" = active ]; then
      up "$u  ($BOOT)"
      [ "$BOOT" = enabled ] || { warn "$u NO arrancará solo tras un reinicio."; problem; }
    else
      down "$u  estado=$STATE  arranque=$BOOT"
      problem
    fi
  done

  RESTARTS="$(systemctl show -p NRestarts --value "$UNIT" 2>/dev/null || echo 0)"
  [ "${RESTARTS:-0}" -gt 0 ] 2>/dev/null && note "La app se ha reiniciado ${RESTARTS} vez/veces."
  MEM="$(systemctl show -p MemoryCurrent --value "$UNIT" 2>/dev/null || true)"
  case "$MEM" in
    ''|'[not set]'|18446744073709551615) ;;
    *) note "Memoria: $((MEM / 1024 / 1024)) MiB (MemoryHigh=1G, MemoryMax=1500M)" ;;
  esac
  head2 "Service status"
else
  printf '%s==>%s Service status\n' "$_BLUE" "$_OFF"
fi

# ── proveedor y API ──────────────────────────────────────────────────────────
MODELS=""
if MODELS="$(provider_models)"; then
  COUNT="$(model_ids "$MODELS" | wc -l | tr -d ' ')"
  up "${PROVIDER_LABEL}        ${PROVIDER_URL}  (${COUNT} model(s) available)"
else
  MODELS=""
  down "${PROVIDER_LABEL}        ${PROVIDER_URL:-<sin configurar>}  -> check provider configuration"
  problem
fi

if curl -fsS --max-time 5 "${API_URL}/api/health" >/dev/null 2>&1; then
  up "API              ${API_URL}  (HOST=${HOST_CFG})"
else
  down "API              ${API_URL}  -> systemctl status ${UNIT}  ·  o ./scripts/start.sh en desarrollo"
  problem
fi

if curl -fsS --max-time 5 http://localhost:5173 >/dev/null 2>&1; then
  up "Vite (frontend)  http://localhost:5173  (desarrollo)"
else
  note "Vite (frontend)  http://localhost:5173  -> solo desarrollo; en el servidor no corre"
fi

# ── configuración ────────────────────────────────────────────────────────────
head2 "Configuration"
[ -f .env ] && good ".env present ($(stat -c '%a %U:%G' .env 2>/dev/null))" \
            || { bad ".env missing -> run ./scripts/setup.sh"; problem; }
[ -d node_modules ] && good "node_modules present" \
                    || { bad "node_modules missing -> run ./scripts/setup.sh"; problem; }

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -ge 22 ] && node_sqlite_ok; then
  good "node $(node -v) with node:sqlite"
else
  bad "node $(node -v 2>/dev/null || echo 'missing') cannot use node:sqlite -> need 22.13+ or 24 LTS"
  problem
fi

# hasBuild se evalúa una sola vez al arrancar: un dist/ viejo o ausente es un
# fallo silencioso que solo se ve al abrir el navegador.
if [ -f dist/index.html ]; then
  if [ -n "$(find src ./*.html -newer dist/index.html -print -quit 2>/dev/null)" ]; then
    bad "dist/ es más viejo que el código -> sudo ./scripts/deploy.sh (o npm run build)"
    problem
  else
    good "dist/index.html presente y al día"
  fi
else
  bad "no hay dist/index.html: el servidor solo respondería /api -> npm run build"
  problem
fi

# Se pregunta por HTTP en vez de importar server/db.js: abrir la base como
# segundo escritor puede dejar cases.db-shm con el dueño equivocado.
CASES="$(curl -fsS --max-time 5 "${API_URL}/api/cases" 2>/dev/null | jq 'length' 2>/dev/null || true)"
if [ -n "$CASES" ]; then
  good "database (${CASES} case(s) vía API)"
elif [ -f data/cases.db ]; then
  note "database data/cases.db presente (la API no responde, no se pudo contar)"
else
  note "database data/cases.db not created yet -> it appears on first run"
fi

if [ -n "$MODELS" ] && [ -n "$PROVIDER_MODEL" ]; then
  if model_available "$MODELS" "$PROVIDER_MODEL"; then
    good "Configured model ${PROVIDER_MODEL} is available"
  else
    bad "Configured model ${PROVIDER_MODEL} is NOT available from ${PROVIDER_LABEL}."
    [ "$PROVIDER_ID" = ollama ] && bad "  ollama pull ${PROVIDER_MODEL}   (el id debe llevar su tag exacto)"
    problem
  fi
fi

if [ "$HOST_CFG" = "0.0.0.0" ]; then
  note "HOST=0.0.0.0: accesible desde toda la red y la app no tiene autenticación."
fi

# ── extremo a extremo ────────────────────────────────────────────────────────
head2 "End-to-end check"
HEALTH="$(curl -fsS --max-time 10 "${API_URL}/api/health" 2>/dev/null || true)"
if [ -z "$HEALTH" ]; then
  down "The API is not answering, so its model provider cannot be checked."
  problem
elif case "$HEALTH" in *'"reachable":true'*) true ;; *) false ;; esac; then
  up "The API can talk to ${PROVIDER_LABEL}. The app is fully operational."
else
  down "The API is up but cannot reach ${PROVIDER_LABEL}:"
  printf '       %s\n' "$HEALTH"
  problem
fi

if [ "$PROBLEMS" -gt 0 ] && command -v journalctl >/dev/null 2>&1; then
  head2 "Últimos avisos del servicio"
  journalctl -u "$UNIT" -n 15 --no-pager -p warning 2>/dev/null \
    || note "(sin acceso al journal; prueba con sudo)"
fi

if [ "$CHECK_MODE" = 1 ]; then
  exit $(( PROBLEMS > 0 ))
fi
exit 0

#!/usr/bin/env bash
# Arrancar el checker en una máquina de DESARROLLO: API (4000) + Vite (5173).
# En el servidor manda systemd; ver el mensaje de --prod más abajo.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=lib.sh
. scripts/lib.sh

if [ "${1:-}" = "--prod" ]; then
  fail "En producción manda systemd, no este script. Usa:
         sudo ./scripts/provision.sh      instalar en un servidor nuevo
         sudo ./scripts/deploy.sh         actualizar y reiniciar
         sudo systemctl restart research-paper-checker
         ./scripts/status.sh              ver qué pasa"
fi

[ -f .env ]         || fail "No .env found. Run ./scripts/setup.sh first."
[ -d node_modules ] || fail "No node_modules. Run ./scripts/setup.sh first."

provider_config
API_PORT="$(env_get API_PORT)"; API_PORT="${API_PORT:-4000}"

info "Checking ${PROVIDER_LABEL} at ${PROVIDER_URL:-<sin configurar>}"
case "$PROVIDER_ID" in
  openrouter)
    if [ -z "$PROVIDER_KEY" ]; then
      warn "OPENROUTER_API_KEY is empty. Evaluations will not run."
    elif MODELS="$(provider_models)"; then
      ok "OpenRouter is reachable and the API key was accepted"
      model_available "$MODELS" "$PROVIDER_MODEL" \
        || warn "OPENROUTER_MODEL=${PROVIDER_MODEL} is not in the current OpenRouter catalog."
    else
      warn "OpenRouter is unreachable or rejected OPENROUTER_API_KEY."
    fi
    ;;
  ollama|lmstudio)
    if MODELS="$(provider_models)"; then
      ok "${PROVIDER_LABEL} is reachable"
      if [ -n "$PROVIDER_MODEL" ] && ! model_available "$MODELS" "$PROVIDER_MODEL"; then
        warn "El modelo configurado (${PROVIDER_MODEL}) no está entre los cargados."
        if [ "$PROVIDER_ID" = ollama ]; then
          warn "Descárgalo con:  ollama pull ${PROVIDER_MODEL}"
        else
          warn "Cárgalo en LM Studio o cambia LM_STUDIO_MODEL en .env."
        fi
        warn "Disponibles ahora:"
        model_ids "$MODELS" | sed 's/^/       /'
      fi
    else
      warn "${PROVIDER_LABEL} NO responde en ${PROVIDER_URL}"
      if [ "$PROVIDER_ID" = ollama ]; then
        warn "Arráncalo con:  sudo systemctl start ollama"
      else
        warn "La app arrancará, pero los cotejos fallarán hasta que enciendas"
        warn "LM Studio -> Developer -> Local Server (o corre: lms server start)."
      fi
    fi
    ;;
  *)
    warn "AI_PROVIDER no reconocido: usa lmstudio, ollama u openrouter."
    ;;
esac

# Solo en desarrollo: bajo systemd esto sería hostil a un reinicio con el socket
# aún en TIME_WAIT, por eso el servicio nunca pasa por este script.
if command -v ss >/dev/null 2>&1; then
  PORT_BUSY="$(ss -ltn "sport = :${API_PORT}" 2>/dev/null | tail -n +2)"
else
  PORT_BUSY="$(lsof -nP -iTCP:"${API_PORT}" -sTCP:LISTEN 2>/dev/null || true)"
fi
if [ -n "$PORT_BUSY" ]; then
  fail "Port ${API_PORT} is already in use. Another instance is probably running.
       See it with:  ss -ltnp 'sport = :${API_PORT}'"
fi

echo
info "Starting the API (${API_PORT}) and Vite (5173). Open http://localhost:5173"
info "Press Ctrl+C to stop both."
echo
exec npm run dev

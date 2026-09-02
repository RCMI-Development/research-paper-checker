#!/usr/bin/env bash
# Preparar una máquina de DESARROLLO. Safe to re-run: never overwrites .env or data.
# En un servidor no uses esto: ./scripts/provision.sh una vez, ./scripts/deploy.sh después.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=lib.sh
. scripts/lib.sh

info "Checking prerequisites"

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install Node 22.13 or newer: https://nodejs.org"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  fail "Node $(node -v) is too old. The backend uses the built-in node:sqlite module,
       which needs Node 22.13 or newer (24 LTS recommended).
       With nvm:  nvm install 24 && nvm use 24"
fi
ok "node $(node -v)"

if ! node_sqlite_ok; then
  fail "This Node build cannot import node:sqlite without --experimental-sqlite.
       Upgrade to Node 22.13+ or 24 LTS:  nvm install 24 && nvm use 24"
fi
ok "node:sqlite available"

info "Installing dependencies (npm install)"
npm install --no-fund --no-audit
ok "node_modules ready"

info "Configuring .env"
if [ -f .env ]; then
  ok ".env already exists, leaving it untouched"
else
  [ -f .env.example ] || fail ".env.example is missing, cannot create .env"
  cp .env.example .env
  chmod 600 .env
  ok ".env created from .env.example (mode 600: it will hold credentials)"
  warn "Open .env and configure AI_PROVIDER plus the model and credentials it needs"
fi

info "Preparing folders"
mkdir -p data/uploads
touch data/uploads/.gitkeep
ok "data/uploads"

# The SQLite schema is created on first import of server/db.js, so just touch it here
# to surface permission or Node problems now rather than at request time.
info "Initialising the database (data/cases.db)"
node --input-type=module -e 'import("./server/db.js").then(()=>process.exit(0))' >/dev/null
ok "database ready"

provider_config
info "Checking ${PROVIDER_LABEL} at ${PROVIDER_URL:-<sin configurar>}"
case "$PROVIDER_ID" in
  openrouter)
    if [ -z "$PROVIDER_KEY" ]; then
      warn "OPENROUTER_API_KEY is empty; add a key before running DGOF or IROC."
    elif provider_models >/dev/null; then
      ok "OpenRouter is reachable and the API key was accepted"
    else
      warn "OpenRouter could not be reached or rejected the configured API key."
    fi
    ;;
  ollama|lmstudio)
    if MODELS="$(provider_models)"; then
      ok "${PROVIDER_LABEL} is reachable. Models you can configure:"
      model_ids "$MODELS" | sed 's/^/       /'
    else
      warn "${PROVIDER_LABEL} is not reachable yet (that is fine for setup)."
      [ "$PROVIDER_ID" = ollama ] && warn "Start it with:  systemctl start ollama"
    fi
    ;;
  *)
    warn "AI_PROVIDER no reconocido. Usa lmstudio, ollama u openrouter."
    ;;
esac

echo
info "Setup complete."
echo "  Next:  1. Confirm the provider settings in .env."
echo "         2. Run  ./scripts/start.sh"

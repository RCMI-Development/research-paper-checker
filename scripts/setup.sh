#!/usr/bin/env bash
# One-time setup. Safe to re-run: it never overwrites .env or existing data.
set -euo pipefail

cd "$(dirname "$0")/.."

info()  { printf '\033[34m==>\033[0m %s\n' "$1"; }
ok()    { printf '\033[32m  ok\033[0m %s\n' "$1"; }
warn()  { printf '\033[33m  !!\033[0m %s\n' "$1"; }
fail()  { printf '\033[31m  xx\033[0m %s\n' "$1" >&2; exit 1; }

info "Checking prerequisites"

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install Node 22.13 or newer: https://nodejs.org"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  fail "Node $(node -v) is too old. The backend uses the built-in node:sqlite module,
       which needs Node 22.13 or newer (24 LTS recommended).
       With nvm:  nvm install 24 && nvm use 24"
fi
ok "node $(node -v)"

# node:sqlite exists from 22.5 but was flag-gated until 22.13 / 23.4. Probe it for real
# instead of guessing from the version string.
if ! node --input-type=module \
     -e 'import("node:sqlite").then(()=>process.exit(0),()=>process.exit(1))' \
     >/dev/null 2>&1; then
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
  ok ".env created from .env.example"
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

# LM Studio pretty-prints its JSON ("id": "x"), so strip whitespace before matching.
model_ids() { printf '%s' "$1" | tr -d ' \n\t' | grep -o '"id":"[^"]*"' | cut -d'"' -f4; }

AI_PROVIDER="$(grep -E '^AI_PROVIDER=' .env | tail -1 | cut -d= -f2- || true)"
AI_PROVIDER="${AI_PROVIDER:-lmstudio}"
if [ "$AI_PROVIDER" = "openrouter" ]; then
  OR_URL="$(grep -E '^OPENROUTER_URL=' .env | tail -1 | cut -d= -f2- || true)"
  OR_URL="${OR_URL:-https://openrouter.ai/api/v1}"
  OR_KEY="$(grep -E '^OPENROUTER_API_KEY=' .env | tail -1 | cut -d= -f2- || true)"
  if [ -z "$OR_KEY" ]; then
    warn "OPENROUTER_API_KEY is empty; add a key before running DGOF or IROC."
  elif curl -fsS --max-time 10 -H "Authorization: Bearer ${OR_KEY}" "${OR_URL}/models" >/dev/null 2>&1; then
    ok "OpenRouter is reachable and the API key was accepted"
  else
    warn "OpenRouter could not be reached or rejected the configured API key."
  fi
else
  LM_URL="$(grep -E '^LM_STUDIO_URL=' .env | tail -1 | cut -d= -f2- || true)"
  LM_URL="${LM_URL:-http://localhost:1234/v1}"
  info "Checking LM Studio at ${LM_URL}"
  if MODELS="$(curl -fsS --max-time 5 "${LM_URL}/models" 2>/dev/null)"; then
    ok "LM Studio is reachable. Models you can put in LM_STUDIO_MODEL:"
    model_ids "$MODELS" | sed 's/^/       /'
  else
    warn "LM Studio is not reachable yet (that is fine for setup)."
  fi
fi

echo
info "Setup complete."
echo "  Next:  1. Confirm the provider settings in .env."
echo "         2. Run  ./scripts/start.sh"

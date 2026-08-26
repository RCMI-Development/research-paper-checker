#!/usr/bin/env bash
# One-time setup. Safe to re-run: it never overwrites .env or existing data.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

info()  { printf '\033[34m==>\033[0m %s\n' "$1"; }
ok()    { printf '\033[32m  ok\033[0m %s\n' "$1"; }
warn()  { printf '\033[33m  !!\033[0m %s\n' "$1"; }
fail()  { printf '\033[31m  xx\033[0m %s\n' "$1" >&2; exit 1; }

info "Checking prerequisites"

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install Node 22.12 or newer: https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  fail "Node $(node -v) is too old. This project needs 22.12 or newer."
fi
ok "node $(node -v)"

command -v uv >/dev/null 2>&1 || fail "uv not found. Install it: curl -LsSf https://astral.sh/uv/install.sh | sh"
ok "uv $(uv --version | awk '{print $2}')"

info "Installing frontend dependencies (npm install)"
npm install --no-fund --no-audit
ok "node_modules ready"

info "Installing Python dependencies (uv sync)"
uv sync
ok "Python environment ready"

info "Configuring .env"
if [ -f .env ]; then
  ok ".env already exists, leaving it untouched"
else
  cp .env.example .env
  SECRET="$(uv run python -c 'import secrets; print(secrets.token_urlsafe(64))')"
  # Portable in-place edit (works on both macOS and Linux sed).
  tmp="$(mktemp)"
  sed "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=${SECRET}|" .env > "$tmp" && mv "$tmp" .env
  ok ".env created from .env.example with a fresh DJANGO_SECRET_KEY"
  warn "Open .env and confirm LM_STUDIO_MODEL matches a model you have in LM Studio"
fi

info "Preparing folders"
mkdir -p data/uploads
ok "data/uploads"

info "Applying database migrations"
uv run python backend/manage.py migrate
ok "database ready"

if [ -f data/cases.db ]; then
  info "Legacy Node database found (data/cases.db) — importing"
  uv run python backend/manage.py import_legacy_cases
  ok "legacy cases imported (this command is idempotent)"
fi

echo
info "Setup complete."
echo "  Next:  1. Start the LM Studio local server (Developer -> Local Server)."
echo "         2. Run  ./scripts/start.sh"
echo
echo "  Optional, to use the Django admin at http://localhost:4000/admin/:"
echo "         uv run python backend/manage.py createsuperuser"

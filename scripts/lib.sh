#!/usr/bin/env bash
# Shared helpers. Source this, do not execute it:
#     . "$(dirname "$0")/lib.sh"
# Every script cd's to the repo root first, so .env lookups are relative to it.

# Colour only on a terminal. Under systemd these run into the journal, where raw
# escape sequences are noise.
if [ -t 1 ]; then
  _BLUE=$'\033[34m'; _GREEN=$'\033[32m'; _RED=$'\033[31m'; _YELLOW=$'\033[33m'; _OFF=$'\033[0m'
else
  _BLUE=''; _GREEN=''; _RED=''; _YELLOW=''; _OFF=''
fi

# Progress vocabulary (setup.sh, start.sh, provision.sh, deploy.sh).
info() { printf '%s==>%s %s\n' "$_BLUE" "$_OFF" "$1"; }
ok()   { printf '%s  ok%s %s\n' "$_GREEN" "$_OFF" "$1"; }
warn() { printf '%s  !!%s %s\n' "$_YELLOW" "$_OFF" "$1"; }
fail() { printf '%s  xx%s %s\n' "$_RED" "$_OFF" "$1" >&2; exit 1; }

# Report vocabulary (status.sh): up/down for reachability, good/bad for assertions.
up()   { printf '%s  UP  %s %s\n' "$_GREEN" "$_OFF" "$1"; }
down() { printf '%s DOWN %s %s\n' "$_RED" "$_OFF" "$1"; }
good() { printf '%s  ok  %s %s\n' "$_GREEN" "$_OFF" "$1"; }
bad()  { printf '%s  xx  %s %s\n' "$_RED" "$_OFF" "$1"; }
note() { printf '%s  --  %s %s\n' "$_YELLOW" "$_OFF" "$1"; }
head2() { printf '\n%s==>%s %s\n' "$_BLUE" "$_OFF" "$1"; }

# Read one key from .env without sourcing the file. Last definition wins; the ^
# anchor means commented-out lines are correctly ignored.
env_get() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }

# LM Studio pretty-prints its JSON ("id": "x"), so strip whitespace before matching.
model_ids() { printf '%s' "$1" | tr -d ' \n\t' | grep -o '"id":"[^"]*"' | cut -d'"' -f4; }

# ¿Está <id> en el catálogo? Sin tubería a propósito: `model_ids ... | grep -q`
# parece correcto pero grep -q cierra la tubería en cuanto acierta, el `cut` de
# model_ids muere con SIGPIPE (141) y `set -o pipefail` convierte el acierto en
# un fallo. Con un catálogo grande (OpenRouter devuelve ~700 KB) pasa siempre.
model_available() { # model_available <catálogo-json> <id>
  local ids
  ids="$(model_ids "$1")"
  case $'\n'"$ids"$'\n' in
    *$'\n'"$2"$'\n'*) return 0 ;;
    *) return 1 ;;
  esac
}

# Resolve AI_PROVIDER into PROVIDER_ID/LABEL/URL/MODEL/KEY. Keep the branch here
# only: it used to be copy-pasted into three scripts, each of which treated any
# unknown value as LM Studio and probed the wrong port.
provider_config() {
  PROVIDER_ID="$(env_get AI_PROVIDER)"; PROVIDER_ID="${PROVIDER_ID:-lmstudio}"
  PROVIDER_KEY=""
  case "$PROVIDER_ID" in
    ollama)
      PROVIDER_LABEL="Ollama"
      PROVIDER_URL="$(env_get OLLAMA_URL)";     PROVIDER_URL="${PROVIDER_URL:-http://127.0.0.1:11434/v1}"
      PROVIDER_MODEL="$(env_get OLLAMA_MODEL)"; PROVIDER_MODEL="${PROVIDER_MODEL:-llama3.1:8b}"
      ;;
    openrouter)
      PROVIDER_LABEL="OpenRouter"
      PROVIDER_URL="$(env_get OPENROUTER_URL)";     PROVIDER_URL="${PROVIDER_URL:-https://openrouter.ai/api/v1}"
      PROVIDER_MODEL="$(env_get OPENROUTER_MODEL)"; PROVIDER_MODEL="${PROVIDER_MODEL:-openai/gpt-oss-20b}"
      PROVIDER_KEY="$(env_get OPENROUTER_API_KEY)"
      ;;
    lmstudio)
      PROVIDER_LABEL="LM Studio"
      PROVIDER_URL="$(env_get LM_STUDIO_URL)";     PROVIDER_URL="${PROVIDER_URL:-http://localhost:1234/v1}"
      PROVIDER_MODEL="$(env_get LM_STUDIO_MODEL)"; PROVIDER_MODEL="${PROVIDER_MODEL:-openai/gpt-oss-20b}"
      ;;
    *)
      PROVIDER_LABEL="AI_PROVIDER=$PROVIDER_ID (unrecognised)"
      PROVIDER_URL=""
      PROVIDER_MODEL=""
      ;;
  esac
}

# Fetch the provider catalogue. Echoes the body, or nothing and returns non-zero.
# Call provider_config first.
provider_models() {
  [ -n "$PROVIDER_URL" ] || return 1
  if [ "$PROVIDER_ID" = "openrouter" ]; then
    [ -n "$PROVIDER_KEY" ] || return 1
    curl -fsS --max-time 10 -H "Authorization: Bearer ${PROVIDER_KEY}" "${PROVIDER_URL}/models" 2>/dev/null
  else
    curl -fsS --max-time "${PROVIDER_TIMEOUT:-5}" "${PROVIDER_URL}/models" 2>/dev/null
  fi
}

# node:sqlite exists from 22.5 but was flag-gated until 22.13 / 23.4. Probe it for
# real instead of guessing from the version string. server/db.js has no fallback.
node_sqlite_ok() {
  node --input-type=module \
    -e 'import("node:sqlite").then(()=>process.exit(0),()=>process.exit(1))' \
    >/dev/null 2>&1
}

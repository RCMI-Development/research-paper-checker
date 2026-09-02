#!/usr/bin/env bash
# Actualizar el servidor: pull -> npm ci -> build -> intercambio de dist/ -> reinicio.
# El orden importa: hasBuild (server/index.js) se evalúa UNA vez al cargar el
# módulo, así que dist/ tiene que estar completo ANTES de reiniciar.
#
#   sudo ./scripts/deploy.sh              actualizar a origin/<rama actual>
#   sudo ./scripts/deploy.sh --rollback   volver al dist/ y al commit anteriores
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/research-paper-checker}"
UNIT="${UNIT:-research-paper-checker.service}"
SVC_USER="${SVC_USER:-rpchecker}"
ROLLBACK=0
[ "${1:-}" = "--rollback" ] && ROLLBACK=1

cd "$APP_DIR"
# shellcheck source=lib.sh
. scripts/lib.sh

[ "$(id -u)" -eq 0 ] || fail "Hace falta root:  sudo $0 ${1:-}"
[ -d .git ] || fail "${APP_DIR} no es un checkout de git."

API_PORT="$(env_get API_PORT)"; API_PORT="${API_PORT:-4000}"

fix_perms() {
  chown -R root:"$SVC_USER" "$APP_DIR"
  chmod -R u=rwX,g=rX,o= "$APP_DIR"
  chown -R "$SVC_USER":"$SVC_USER" "$APP_DIR/data"
  chmod -R u=rwX,g=rwX,o= "$APP_DIR/data"
  chmod 0640 "$APP_DIR/.env"
}

wait_healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 3 "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if [ "$ROLLBACK" = 1 ]; then
  info "Volviendo atrás"
  [ -d dist.prev ] || fail "No hay dist.prev; no se puede revertir el build."
  rm -rf dist
  mv dist.prev dist
  if [ -f .deploy-prev-sha ]; then
    git reset --hard "$(cat .deploy-prev-sha)"
    npm ci --include=dev --no-audit --no-fund
  fi
  fix_perms
  systemctl restart "$UNIT"
  wait_healthy && ok "Revertido: $(git log --oneline -1)" || fail "Sigue sin responder."
  exit 0
fi

BEFORE="$(git rev-parse HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

info "Actualizando el código (${BRANCH})"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
git fetch --prune origin
git merge --ff-only "origin/${BRANCH}"
printf '%s\n' "$BEFORE" > .deploy-prev-sha
ok "$(git log --oneline -1)"

if [ "$(git rev-parse HEAD)" = "$BEFORE" ]; then
  info "Sin commits nuevos; se recompila igual para dejarlo consistente."
fi

# --include=dev a propósito: vite es devDependency y el build la necesita. No
# confíes en NODE_ENV para esto, el comportamiento de npm ha cambiado.
info "Instalando dependencias (npm ci)"
env HOME=/root npm ci --include=dev --no-audit --no-fund

# Se compila a un directorio aparte y se intercambia: vite vacía outDir al
# empezar, así que compilar sobre dist/ deja al servicio sin páginas si falla.
info "Compilando a dist.new/"
rm -rf dist.new
env HOME=/root npx vite build --outDir dist.new --emptyOutDir
[ -f dist.new/index.html ] || fail "El build no produjo dist.new/index.html; no se tocó dist/."

info "Intercambiando dist/"
rm -rf dist.prev
[ -d dist ] && mv dist dist.prev
mv dist.new dist
ok "dist/ actualizado (el anterior queda en dist.prev)"

fix_perms

info "Reiniciando ${UNIT}"
systemctl restart "$UNIT"

if wait_healthy; then
  ok "Desplegado: ${BEFORE:0:8} -> $(git rev-parse --short HEAD)"
  curl -fsS "http://127.0.0.1:${API_PORT}/api/health"; echo
else
  fail "La API no respondió en 30 s.
       Bitácora:  journalctl -u ${UNIT} -n 50 --no-pager
       Revertir:  sudo $0 --rollback"
fi

#!/usr/bin/env bash
# De un Ubuntu recién instalado a la aplicación corriendo sola tras un reinicio.
# Instala Node (NodeSource), Ollama, el código y los servicios de systemd.
# Es idempotente: correrlo dos veces no rompe nada y repara permisos.
#
#   sudo ./scripts/provision.sh                 instalación completa
#   sudo ./scripts/provision.sh --update        actualizar y reiniciar
#   sudo ./scripts/provision.sh --dry-run       enseñar sin tocar nada
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/research-paper-checker}"
SVC_USER="${SVC_USER:-rpchecker}"
REPO_URL="${REPO_URL:-https://github.com/RCMI-Development/research-paper-checker.git}"
NODE_MAJOR="${NODE_MAJOR:-24}"
API_PORT="${API_PORT:-4000}"
# El usuario pidió acceso desde la LAN. Ver la advertencia en el paso 6.
BIND_HOST="${BIND_HOST:-0.0.0.0}"
OLLAMA_MODEL="${OLLAMA_MODEL:-}"
SOURCE_PATH=""
DRY_RUN=0
UPDATE_ONLY=0
SKIP_MODEL=0
SKIP_UFW=0
ALLOW_DIRTY=0

usage() {
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Opciones:
  --update            solo actualizar: pull, npm ci, build, reiniciar
  --source PATH       clonar desde un checkout local en vez de GitHub
  --model TAG         modelo de Ollama (por defecto: según la RAM detectada)
  --skip-model        instalar Ollama sin descargar modelo
  --localhost         escuchar solo en 127.0.0.1 (más seguro; requiere túnel SSH)
  --port N            puerto de la API (por defecto 4000)
  --node-major N      versión mayor de Node (por defecto 24)
  --skip-ufw          no tocar el cortafuegos
  --allow-dirty       clonar aunque el checkout de origen tenga cambios sin confirmar
  --dry-run           enseñar cada acción sin ejecutarla
EOF
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --update)     UPDATE_ONLY=1 ;;
    --source)     SOURCE_PATH="${2:?--source necesita una ruta}"; shift ;;
    --model)      OLLAMA_MODEL="${2:?--model necesita un tag}"; shift ;;
    --skip-model) SKIP_MODEL=1 ;;
    --localhost)  BIND_HOST=127.0.0.1 ;;
    --port)       API_PORT="${2:?--port necesita un número}"; shift ;;
    --node-major) NODE_MAJOR="${2:?--node-major necesita un número}"; shift ;;
    --skip-ufw)   SKIP_UFW=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --dry-run)    DRY_RUN=1 ;;
    -h|--help)    usage ;;
    *) printf 'Opción desconocida: %s (usa --help)\n' "$1" >&2; exit 1 ;;
  esac
  shift
done

HERE="$(cd "$(dirname "$0")" && pwd)"
# El script vive dentro del repo, así que deploy/ está siempre aquí al lado —
# también cuando APP_DIR todavía no existe.
REPO_ROOT="$(cd "$HERE/.." && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

run() {
  if [ "$DRY_RUN" = 1 ]; then printf '     $ %s\n' "$*"; else "$@"; fi
}

# Escribe solo si el contenido cambia, para no disparar daemon-reload ni
# reinicios en una corrida que debería ser un no-op.
write_if_changed() {
  local dest="$1" tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then
    rm -f "$tmp"
    return 1
  fi
  if [ "$DRY_RUN" = 1 ]; then
    printf '     $ (escribir %s)\n' "$dest"
    rm -f "$tmp"
    return 0
  fi
  install -Dm644 -o root -g root "$tmp" "$dest"
  rm -f "$tmp"
  return 0
}

# git clone copia SOLO lo confirmado. Si el checkout de origen tiene cambios sin
# confirmar, el servidor recibe una versión distinta de la que estás mirando —
# y el fallo típico es un scripts/ a medias que ni siquiera arranca.
require_clean_source() {
  local src="$1" dirty
  [ -d "$src/.git" ] || return 0
  dirty="$(git -C "$src" status --porcelain 2>/dev/null || true)"
  [ -n "$dirty" ] || return 0
  if [ "$ALLOW_DIRTY" = 1 ]; then
    warn "El origen ${src} tiene cambios sin confirmar; se clonará solo lo confirmado."
    return 0
  fi
  printf '%s\n' "$dirty" | sed 's/^/       /' >&2
  fail "El checkout de origen (${src}) tiene cambios sin confirmar y git clone
       solo copia lo confirmado: el servidor recibiría otra versión.
       Confírmalos primero, o usa --allow-dirty si de verdad quieres el estado
       confirmado que ves arriba."
}

# ─────────────────────────────── 1. Preflight ───────────────────────────────
info "1/8  Comprobando el sistema"

if [ "$(id -u)" -ne 0 ]; then
  fail "Hace falta root. Vuelve a lanzarlo con:  sudo $0 $*"
fi
[ -d /run/systemd/system ] || fail "Este sistema no usa systemd; el script instala servicios."

# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}:${VERSION_ID:-}" in
  ubuntu:24.04|ubuntu:22.04) ok "${PRETTY_NAME}" ;;
  ubuntu:*) warn "${PRETTY_NAME} no está probado (se probó 22.04 y 24.04)" ;;
  *) warn "Se esperaba Ubuntu; se detectó ${PRETTY_NAME:-desconocido}. Continuando." ;;
esac

ARCH="$(dpkg --print-architecture)"
case "$ARCH" in
  amd64|arm64) ok "arquitectura ${ARCH}" ;;
  *) fail "Ollama no publica binarios para ${ARCH}." ;;
esac

RAM_MB=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
SWAP_MB=$(awk '/SwapTotal/{print int($2/1024)}' /proc/meminfo)
CORES=$(nproc)
HAS_GPU=0
command -v nvidia-smi >/dev/null 2>&1 && HAS_GPU=1

ok "${RAM_MB} MB de RAM · ${CORES} núcleo(s) · swap ${SWAP_MB} MB"
[ "$HAS_GPU" = 1 ] && ok "GPU NVIDIA detectada" || info "Sin GPU: la inferencia irá por CPU"

if [ "$RAM_MB" -lt 4096 ]; then
  # Con --skip-model el modelo vive en otra máquina, así que la RAM de esta no
  # es un impedimento: la app sola ocupa decenas de MB.
  if [ "$SKIP_MODEL" = 1 ]; then
    warn "Solo ${RAM_MB} MB de RAM, pero --skip-model: aquí solo corre la aplicación.
       Apunta OLLAMA_URL en .env al servidor que sí tenga el modelo."
  else
    fail "Solo ${RAM_MB} MB de RAM. Un modelo local necesita 8 GB para dar resultados
       utilizables y 4 GB como mínimo absoluto. Esta caja no sirve de servidor de
       modelo: usa --skip-model y apunta OLLAMA_URL a otra máquina."
  fi
fi
[ "$RAM_MB" -ge 8192 ] || [ "$SKIP_MODEL" = 1 ] \
  || warn "Con ${RAM_MB} MB solo cabe un modelo de 3B, que falla a menudo al devolver JSON estricto."
[ "$CORES" -ge 4 ] || warn "${CORES} núcleo(s): cada cotejo puede tardar varios minutos sin GPU."
[ "$SWAP_MB" -ge 2048 ] || warn "Swap = ${SWAP_MB} MB: con poca RAM, Ollama muere por OOM en vez de degradarse."

# Modelo según la RAM. Los tags se confirman contra /v1/models después del pull.
if [ -z "$OLLAMA_MODEL" ]; then
  if   [ "$RAM_MB" -lt  8192 ]; then OLLAMA_MODEL="llama3.2:3b";          MODEL_MB=2600
  elif [ "$RAM_MB" -lt 16384 ]; then OLLAMA_MODEL="qwen2.5:7b-instruct";  MODEL_MB=5000
  elif [ "$RAM_MB" -lt 24576 ]; then OLLAMA_MODEL="qwen2.5:14b-instruct"; MODEL_MB=9500
  elif [ "$RAM_MB" -lt 65536 ]; then OLLAMA_MODEL="gpt-oss:20b";          MODEL_MB=15000
  else                               OLLAMA_MODEL="gpt-oss:120b";         MODEL_MB=66000
  fi
  info "Modelo elegido por RAM: ${OLLAMA_MODEL} (cámbialo con --model)"
else
  MODEL_MB=16000
  info "Modelo pedido: ${OLLAMA_MODEL}"
fi

free_mb() { df -Pm "$1" 2>/dev/null | awk 'NR==2{print $4}'; }
if [ "$SKIP_MODEL" = 0 ]; then
  NEED_MB=$(( MODEL_MB * 13 / 10 ))
  HAVE_MB="$(free_mb /var/lib || echo 0)"
  [ "${HAVE_MB:-0}" -ge "$NEED_MB" ] \
    || fail "/var/lib tiene ${HAVE_MB} MB libres y ${OLLAMA_MODEL} necesita ~${NEED_MB} MB."
fi

if [ "$UPDATE_ONLY" = 1 ]; then
  [ -d "$APP_DIR/.git" ] || fail "--update pero no hay checkout en ${APP_DIR}."
fi

# ──────────────────────────── 2. Paquetes base ──────────────────────────────
info "2/8  Paquetes base"
export DEBIAN_FRONTEND=noninteractive
if [ "$UPDATE_ONLY" = 0 ]; then
  run apt-get update -qq
  run apt-get install -y -qq ca-certificates curl gnupg git jq iproute2
  ok "curl, git, jq, gnupg"
fi

# ───────────────────────── 3. Node por NodeSource ───────────────────────────
info "3/8  Node.js ${NODE_MAJOR}.x"

# Un node de nvm es invisible para systemd, así que "hay node" no basta: tiene
# que estar en una ruta del sistema.
node_is_good() {
  local bin; bin="$(command -v node 2>/dev/null || true)"
  [ -n "$bin" ] || return 1
  case "$bin" in /usr/bin/node|/usr/local/bin/node) ;; *) return 1 ;; esac
  [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 22 ] || return 1
  node_sqlite_ok
}

if node_is_good; then
  ok "$(node -v) en $(command -v node), con node:sqlite"
elif [ "$UPDATE_ONLY" = 1 ]; then
  fail "--update pero Node del sistema no sirve. Corre el script sin --update."
else
  if command -v node >/dev/null 2>&1; then
    warn "Hay un node en $(command -v node) que no sirve para el servicio (nvm o demasiado viejo)."
  fi
  if dpkg-query -W -f='${Version}' nodejs 2>/dev/null | grep -qv nodesource; then
    warn "Reemplazando el nodejs de Ubuntu por el de NodeSource"
    run apt-get remove -y -qq nodejs npm libnode-dev || true
  fi
  run install -d -m 0755 /usr/share/keyrings
  if [ "$DRY_RUN" = 1 ]; then
    printf '     $ curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg\n'
  else
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
    chmod 0644 /usr/share/keyrings/nodesource.gpg
  fi
  NODE_LIST=/etc/apt/sources.list.d/nodesource.list
  NODE_LINE="deb [arch=${ARCH} signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main"
  if [ "$(cat "$NODE_LIST" 2>/dev/null || true)" != "$NODE_LINE" ]; then
    if [ "$DRY_RUN" = 1 ]; then
      printf '     $ (escribir %s)\n       %s\n' "$NODE_LIST" "$NODE_LINE"
      printf '     $ (escribir /etc/apt/preferences.d/nodesource — pin 600 sobre el nodejs de Ubuntu)\n'
    else
      printf '%s\n' "$NODE_LINE" > "$NODE_LIST"
      # Que el nodejs de Ubuntu no gane nunca una actualización.
      printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600\n' \
        > /etc/apt/preferences.d/nodesource
    fi
    run apt-get update -qq
  fi
  run apt-get install -y -qq nodejs
  if [ "$DRY_RUN" = 0 ]; then
    node_is_good || fail "Node sigue sin servir tras instalar NodeSource: $(node -v 2>&1)"
    ok "$(node -v) instalado en $(command -v node)"
  fi
fi

# ──────────────────────────────── 4. Ollama ─────────────────────────────────
info "4/8  Ollama"
if [ "$UPDATE_ONLY" = 1 ]; then
  ok "--update: se deja Ollama como está"
elif command -v ollama >/dev/null 2>&1; then
  ok "ollama ya instalado ($(ollama --version 2>/dev/null | head -1))"
else
  # Se descarga y se ejecuta como archivo, no con «curl | sh»: así queda en
  # disco y se puede leer si algo sale mal. Sigue siendo código de terceros
  # ejecutado como root; es el camino que Ollama soporta oficialmente.
  if [ "$DRY_RUN" = 1 ]; then
    printf '     $ (descargar y ejecutar https://ollama.com/install.sh)\n'
  else
    OLLAMA_TMP="$(mktemp -d)"
    trap 'rm -rf "$OLLAMA_TMP"' EXIT
    curl -fsSL --retry 3 -o "$OLLAMA_TMP/install.sh" https://ollama.com/install.sh
    head -1 "$OLLAMA_TMP/install.sh" | grep -q '^#!' \
      || fail "Lo descargado de ollama.com no parece un script."
    sh "$OLLAMA_TMP/install.sh"
    command -v ollama >/dev/null 2>&1 || fail "El instalador de Ollama no dejó el binario en el PATH."
    ok "ollama instalado"
  fi
fi

if write_if_changed /etc/systemd/system/ollama.service.d/override.conf \
     < "$REPO_ROOT/deploy/ollama.service.d/override.conf"; then
  ok "drop-in de ollama actualizado"
  run systemctl daemon-reload
  run systemctl restart ollama
else
  ok "drop-in de ollama sin cambios"
fi
run systemctl enable --now ollama

if [ "$DRY_RUN" = 0 ]; then
  for i in $(seq 1 60); do
    curl -fsS --max-time 2 http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break
    [ "$i" = 60 ] && fail "Ollama no respondió en 60 s:  journalctl -u ollama -n 50"
    sleep 1
  done
  ok "Ollama responde en 127.0.0.1:11434"
fi

RESOLVED_MODEL="$OLLAMA_MODEL"
if [ "$SKIP_MODEL" = 1 ]; then
  warn "--skip-model: no se descargó ningún modelo. Hazlo con:  ollama pull ${OLLAMA_MODEL}"
elif [ "$UPDATE_ONLY" = 1 ]; then
  :
elif [ "$DRY_RUN" = 1 ]; then
  printf '     $ ollama pull %s\n' "$OLLAMA_MODEL"
else
  info "Descargando ${OLLAMA_MODEL} (~${MODEL_MB} MB). Esto puede tardar bastante."
  ollama pull "$OLLAMA_MODEL"
  # El health check compara el id EXACTO contra /v1/models. Si el tag que
  # guardamos en .env no coincide, la interfaz enseña el punto rojo para
  # siempre aunque los cotejos funcionen.
  CATALOG="$(curl -fsS --max-time 10 http://127.0.0.1:11434/v1/models || true)"
  if model_available "$CATALOG" "$OLLAMA_MODEL"; then
    RESOLVED_MODEL="$OLLAMA_MODEL"
  else
    # Ollama a veces normaliza el tag (p. ej. "latest"). Se coge el primero que
    # empiece por el mismo nombre base. Sin `| head -1`: cerraría la tubería y
    # SIGPIPE + pipefail abortaría el script.
    RESOLVED_MODEL=""
    while IFS= read -r id; do
      case "$id" in "${OLLAMA_MODEL%%:*}"*) RESOLVED_MODEL="$id"; break ;; esac
    done <<EOF
$(model_ids "$CATALOG")
EOF
  fi
  [ -n "$RESOLVED_MODEL" ] || fail "Ollama no reporta ${OLLAMA_MODEL} en /v1/models."
  ok "modelo disponible como: ${RESOLVED_MODEL}"
fi

# ───────────────────── 5. Usuario, código y compilación ─────────────────────
info "5/8  Código en ${APP_DIR}"

if ! id -u "$SVC_USER" >/dev/null 2>&1; then
  run useradd --system --no-create-home --home-dir /nonexistent \
      --shell /usr/sbin/nologin "$SVC_USER"
  ok "usuario de servicio ${SVC_USER} creado"
else
  ok "usuario ${SVC_USER} ya existe"
fi

if [ -d "$APP_DIR/.git" ]; then
  ok "checkout existente"
  if [ "$UPDATE_ONLY" = 1 ]; then
    run git -C "$APP_DIR" config --global --add safe.directory "$APP_DIR"
    run git -C "$APP_DIR" pull --ff-only
    ok "$(git -C "$APP_DIR" log --oneline -1 2>/dev/null || echo actualizado)"
  fi
elif [ -n "$SOURCE_PATH" ]; then
  require_clean_source "$SOURCE_PATH"
  run git clone "$SOURCE_PATH" "$APP_DIR"
  run git -C "$APP_DIR" remote set-url origin "$REPO_URL"
  ok "clonado desde ${SOURCE_PATH}"
elif [ "$REPO_ROOT" != "$APP_DIR" ] && [ -d "$REPO_ROOT/.git" ]; then
  # Se está ejecutando desde un checkout: clonar de ahí evita pedir credenciales
  # y deja fuera node_modules, dist/ y el .env de desarrollo.
  require_clean_source "$REPO_ROOT"
  run git clone "$REPO_ROOT" "$APP_DIR"
  run git -C "$APP_DIR" remote set-url origin "$REPO_URL"
  ok "clonado desde ${REPO_ROOT}"
else
  run git clone "$REPO_URL" "$APP_DIR"
  ok "clonado desde ${REPO_URL}"
fi
run git config --global --add safe.directory "$APP_DIR"

if [ "$DRY_RUN" = 0 ]; then
  cd "$APP_DIR"
  info "Instalando dependencias (npm ci)"
  # --include=dev a propósito: vite es devDependency y hace falta para el build.
  env HOME=/root npm ci --include=dev --no-audit --no-fund
  info "Compilando dist/"
  env HOME=/root npm run build
  [ -f dist/index.html ] \
    || fail "El build no dejó dist/index.html. El servicio serviría solo /api."
  ok "dist/ listo"
fi

# ────────────────────────────── 6. .env ─────────────────────────────────────
info "6/8  Configuración"
ENV_FILE="$APP_DIR/.env"
if [ -e "$ENV_FILE" ]; then
  ok ".env ya existe, no se toca"
elif [ "$DRY_RUN" = 1 ]; then
  printf '     $ (escribir %s)\n' "$ENV_FILE"
else
  umask 077
  cat > "$ENV_FILE" <<EOF
# Generado por scripts/provision.sh el $(date -Is). No se versiona.
# systemd lo carga con EnvironmentFile= y dotenv nunca pisa lo que ya existe:
# si los dos discrepan, gana systemd.
API_PORT=${API_PORT}
HOST=${BIND_HOST}

AI_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434/v1
# Debe ser el id EXACTO que devuelve /v1/models, con su tag.
OLLAMA_MODEL=${RESOLVED_MODEL}

# LM Studio (AI_PROVIDER=lmstudio) — no se usa en este servidor.
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=openai/gpt-oss-20b

# OpenRouter (AI_PROVIDER=openrouter) SACA EL TEXTO DE LA PROPUESTA DE ESTE
# SERVIDOR. Requiere autorización institucional y revisión de privacidad.
OPENROUTER_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-oss-120b
OPENROUTER_APP_NAME=RCM Research Paper Checker
EOF
  ok ".env creado"
fi

if [ "$DRY_RUN" = 0 ]; then
  # Añade claves que falten sin tocar las que ya estén (instalaciones viejas).
  env_ensure() { grep -qE "^$1=" "$ENV_FILE" || printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"; }
  env_ensure OLLAMA_URL   "http://127.0.0.1:11434/v1"
  env_ensure OLLAMA_MODEL "$RESOLVED_MODEL"
  # 0640 root:rpchecker — el servicio lo lee, nadie más. El .env de desarrollo
  # es 0664 y lleva una clave de API dentro.
  chown root:"$SVC_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  ok "$(stat -c '%a %U:%G' "$ENV_FILE") .env"
fi

# ─────────────────────── 7. Permisos y servicio ─────────────────────────────
info "7/8  Permisos y servicio"
if [ "$DRY_RUN" = 0 ]; then
  chown -R root:"$SVC_USER" "$APP_DIR"
  chmod -R u=rwX,g=rX,o= "$APP_DIR"
  # ReadWritePaths= falla el arranque si el directorio no existe.
  install -d -o "$SVC_USER" -g "$SVC_USER" -m 2770 \
      "$APP_DIR/data" "$APP_DIR/data/uploads" "$APP_DIR/data/certificados"
  chown -R "$SVC_USER":"$SVC_USER" "$APP_DIR/data"
  chmod -R u=rwX,g=rwX,o= "$APP_DIR/data"
  chmod 0640 "$ENV_FILE"
  ok "código root:${SVC_USER} 0750 · data/ ${SVC_USER} 2770 · nada legible por otros"
fi

UNIT_CHANGED=0
write_if_changed /etc/systemd/system/research-paper-checker.service \
  < "$REPO_ROOT/deploy/research-paper-checker.service" && UNIT_CHANGED=1
if [ "$UNIT_CHANGED" = 1 ]; then
  ok "unit instalado"
  run systemctl daemon-reload
else
  ok "unit sin cambios"
fi
run systemctl enable research-paper-checker
run systemctl restart research-paper-checker

# ─────────────────────────── 8. Cortafuegos ─────────────────────────────────
info "8/8  Cortafuegos y comprobación"
if [ "$SKIP_UFW" = 1 ]; then
  ok "--skip-ufw: no se tocó el cortafuegos"
elif ! command -v ufw >/dev/null 2>&1; then
  warn "ufw no está instalado; no se tocó el cortafuegos."
elif [ "$BIND_HOST" = "127.0.0.1" ]; then
  ok "escuchando solo en loopback: no hace falta abrir nada"
else
  # Abrir el puerto solo a rangos privados. Si la caja tiene IP pública, esto es
  # lo que evita publicar propuestas sin publicar en Internet.
  for cidr in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16; do
    run ufw allow from "$cidr" to any port "$API_PORT" proto tcp \
        comment 'research-paper-checker (LAN)'
  done
  ok "puerto ${API_PORT} abierto solo a 10/8, 172.16/12 y 192.168/16"
  warn "Ollama (11434) NO se abre nunca: no tiene autenticación."
fi

if [ "$DRY_RUN" = 0 ]; then
  HEALTH=""
  for _ in $(seq 1 30); do
    HEALTH="$(curl -fsS --max-time 3 "http://127.0.0.1:${API_PORT}/api/health" 2>/dev/null || true)"
    [ -n "$HEALTH" ] && break
    sleep 1
  done
  [ -n "$HEALTH" ] || fail "La API no respondió:  journalctl -u research-paper-checker -n 60 --no-pager"
  if printf '%s' "$HEALTH" | grep -q '"reachable":true'; then
    ok "API y modelo operativos"
  else
    warn "La API responde pero no alcanza el modelo: ${HEALTH}"
  fi
  curl -fsS -o /dev/null "http://127.0.0.1:${API_PORT}/" \
    && ok "dist/ servido en /" \
    || warn "/ no responde; revisa el build."
fi

echo
info "Listo."
if [ "$BIND_HOST" = "0.0.0.0" ]; then
  IP="$(ip -4 -o route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
  echo
  warn "LA APLICACIÓN NO TIENE AUTENTICACIÓN."
  cat <<EOF
  Cualquiera que alcance http://${IP:-<ip>}:${API_PORT} puede leer el texto de
  todas las propuestas guardadas, descargar los certificados archivados y emitir
  certificados nuevos a nombre de quien quiera. El cortafuegos limita el acceso a
  la red privada, pero eso es confianza en la red, no control de acceso.
  Alternativa sin ese riesgo:  sudo $0 --localhost
  y desde tu máquina:          ssh -N -L ${API_PORT}:127.0.0.1:${API_PORT} usuario@servidor

EOF
fi
cat <<EOF
  Abrir:        http://$( [ "$BIND_HOST" = 0.0.0.0 ] && echo "${IP:-<ip-del-servidor>}" || echo localhost ):${API_PORT}
  Estado:       ${APP_DIR}/scripts/status.sh
  Bitácora:     journalctl -u research-paper-checker -f
  Reiniciar:    sudo systemctl restart research-paper-checker
  Actualizar:   sudo ${APP_DIR}/scripts/deploy.sh
EOF

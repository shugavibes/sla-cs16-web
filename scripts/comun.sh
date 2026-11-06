# shellcheck shell=bash
# Funciones compartidas por start.sh, stop.sh y texturas.sh (bash 3.2, macOS y Linux;
# en Windows, Git Bash).

# Git Bash en Windows reescribe los argumentos que parecen rutas Unix antes de pasarlos a
# docker: «+force_install_dir /descarga» le llega al contenedor como
# «C:/Program Files/Git/descarga» y SteamCMD instala fuera de la carpeta compartida.
# En macOS y Linux estas variables no hacen nada.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

# Docker Desktop puede instalar el comando "docker" en lugares que no están en el PATH.
for _d in /usr/local/bin "${HOME:-/root}/.docker/bin" /Applications/Docker.app/Contents/Resources/bin /opt/homebrew/bin; do
  case ":$PATH:" in
    *":$_d:"*) ;;
    *) [ -d "$_d" ] && PATH="$PATH:$_d" ;;
  esac
done
export PATH

if [ -t 1 ]; then
  _B=$'\033[1m'; _V=$'\033[32m'; _A=$'\033[33m'; _R=$'\033[31m'; _N=$'\033[0m'
else
  _B=""; _V=""; _A=""; _R=""; _N=""
fi
paso()  { printf '\n%s%s%s\n' "$_B" "$*" "$_N"; }
ok()    { printf '  %s✓%s %s\n' "$_V" "$_N" "$*"; }
aviso() { printf '  %s!%s %s\n' "$_A" "$_N" "$*"; }
falla() { printf '\n  %s✗ %s%s\n\n' "$_R" "$*" "$_N" >&2; exit 1; }

# Lectura/escritura de .env sin herramientas especiales.
env_get() {
  [ -f .env ] || return 0
  grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}
env_set() {
  local tmp
  touch .env
  tmp=$(mktemp)
  grep -vE "^$1=" .env > "$tmp" 2>/dev/null || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
  chmod 600 .env
}

env_del() {
  local tmp
  [ -f .env ] || return 0
  tmp=$(mktemp)
  grep -vE "^$1=" .env > "$tmp" 2>/dev/null || true
  cat "$tmp" > .env
  rm -f "$tmp"
}

docker_listo() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

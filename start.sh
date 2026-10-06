#!/usr/bin/env bash
# Levanta el CS 1.6 web, sus salas y el estudio de personajes.
#
#   ./start.sh                 modo local: solo se puede entrar desde esta compu (recomendado)
#   ./start.sh lan             también pueden entrar otros dispositivos de tu red (Wi-Fi)
#   ./start.sh online [dominio]  servidor en internet, con HTTPS (en un servidor alquilado)
#
# La primera vez arma las imágenes de Docker y baja los archivos del juego (unos
# minutos); las siguientes arranca en segundos. Las salas están en config/salas.conf.
set -euo pipefail
cd "$(dirname "$0")"
. scripts/comun.sh
. scripts/bajar-juego.sh

MODO="${1:-local}"
case "$MODO" in
  local|lan|online) ;;
  -h|--help|ayuda) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) falla "No conozco el modo «$MODO». Usá ./start.sh (local), ./start.sh lan o ./start.sh online" ;;
esac
DOMINIO_ARG="${2:-}"

ip_de_la_red() {
  local ip=""
  if command -v ipconfig >/dev/null 2>&1; then
    ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
  fi
  if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
  fi
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  fi
  printf '%s' "$ip"
}

ip_publica() {
  local ip=""
  for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
    ip=$(curl -fsS --max-time 8 "$url" 2>/dev/null | tr -d '[:space:]' || true)
    if printf '%s' "$ip" | grep -qE '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
      printf '%s' "$ip"
      return 0
    fi
  done
  return 1
}

es_ip() { printf '%s' "$1" | grep -qE '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; }

esperar() { # esperar <segundos> <descripción> <comando...>
  local limite=$1 que=$2 i=0
  shift 2
  until "$@" >/dev/null 2>&1; do
    i=$((i + 2))
    if [ "$i" -ge "$limite" ]; then return 1; fi
    sleep 2
  done
  ok "$que"
}

servidor_en_linea() {
  curl -fsS "http://$DIR_WEB:27016/api/status" 2>/dev/null | grep -q '"serverOnline":true'
}

# ---------------------------------------------------------------- 1. Docker
paso "Revisando Docker"
if ! command -v docker >/dev/null 2>&1; then
  cat <<'TXT'

  Docker no está instalado. Es lo único que este proyecto necesita.

    1. Bajá Docker Desktop desde https://www.docker.com/products/docker-desktop/
       (en una Mac con chip M elegí "Apple Silicon"). En un servidor Linux corré
       deploy/instalar-vps.sh, que instala todo.
    2. Instalalo, abrilo una vez y aceptá los permisos que pida.
    3. Volvé a correr ./start.sh

TXT
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  if [ "$(uname -s)" = "Darwin" ]; then
    aviso "Docker no estaba abierto; lo abro."
    open -a Docker >/dev/null 2>&1 || true
  fi
  esperar 180 "Docker está andando" docker info || falla "Docker no arrancó. Abrí Docker Desktop a mano, esperá a que diga «running» y volvé a correr ./start.sh"
else
  ok "Docker está andando"
fi
docker compose version >/dev/null 2>&1 || falla "Falta «docker compose». Actualizá Docker."

# ------------------------------------------------------------ 2. Configuración
paso "Preparando la configuración ($MODO)"
touch .env
chmod 600 .env
[ -n "$(env_get RCON_PASSWORD)" ] || env_set RCON_PASSWORD "$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
[ -n "$(env_get CLAVE_ESTADISTICAS)" ] || env_set CLAVE_ESTADISTICAS "$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
[ -n "$(env_get NOMBRE_SERVIDOR)" ] || env_set NOMBRE_SERVIDOR "SLA · Counter-Strike 1.6"
[ -n "$(env_get MAPA)" ] || env_set MAPA "de_dust2"
[ -n "$(env_get MAX_JUGADORES)" ] || env_set MAX_JUGADORES "12"
[ -n "$(env_get BOTS)" ] || env_set BOTS "4"
[ -n "$(env_get BOTS_DIFICULTAD)" ] || env_set BOTS_DIFICULTAD "0"
env_del GAME_IMAGE
env_del GAME_IP
env_del BIND_ADDR

TRAMPAS=0
case "$MODO" in
  local)
    DIR_WEB="127.0.0.1"; BIND_WEB="127.0.0.1"; BIND_UDP="127.0.0.1"; IP_PUB="127.0.0.1"
    URL="http://localhost:27016"; TRAMPAS=1; PROXY=0
    [ -n "$(env_get ARCHIVOS)" ] || env_set ARCHIVOS "servidor"
    ;;
  lan)
    DIR_WEB=$(ip_de_la_red)
    es_ip "$DIR_WEB" || falla "No pude averiguar la IP de esta compu en la red. ¿Estás conectado al Wi-Fi?"
    BIND_WEB="$DIR_WEB"; BIND_UDP="$DIR_WEB"; IP_PUB="$DIR_WEB"; URL="http://$DIR_WEB:27016"; PROXY=0
    [ -n "$(env_get ARCHIVOS)" ] || env_set ARCHIVOS "servidor"
    ;;
  online)
    IP_PUB=$(env_get IP_PUBLICA_FIJA)
    if [ -z "$IP_PUB" ]; then IP_PUB=$(ip_publica) || falla "No pude averiguar la IP pública de este servidor. Ponela en .env como IP_PUBLICA_FIJA=1.2.3.4"; fi
    DOMINIO="${DOMINIO_ARG:-$(env_get DOMINIO)}"
    if [ -z "$DOMINIO" ] || { [ -z "$DOMINIO_ARG" ] && printf '%s' "$DOMINIO" | grep -q 'sslip\.io$'; }; then
      DOMINIO="$(printf '%s' "$IP_PUB" | tr '.' '-').sslip.io"   # dominio gratis que apunta a esta IP
    fi
    env_set DOMINIO "$DOMINIO"
    # Con dominio propio, el link <ip>.sslip.io sigue andando (HTTPS para los dos)
    SSLIP="$(printf '%s' "$IP_PUB" | tr '.' '-').sslip.io"
    if [ "$DOMINIO" = "$SSLIP" ]; then env_set DOMINIO_CADDY "$DOMINIO"; else env_set DOMINIO_CADDY "$DOMINIO, $SSLIP"; fi
    DIR_WEB="127.0.0.1"; BIND_WEB="127.0.0.1"; BIND_UDP="0.0.0.0"; URL="https://$DOMINIO"; PROXY=1
    # Público: cada jugador usa sus propios archivos del juego (no se reparten los de Valve)
    [ -n "$(env_get ARCHIVOS)" ] || env_set ARCHIVOS "propios"
    if [ "$(env_get ARCHIVOS)" = "servidor" ] && [ -z "$(env_get CONTRASENA)" ]; then
      falla "Con ARCHIVOS=servidor la página reparte los archivos de Valve: en internet solo se permite
    con contraseña (CONTRASENA=... en .env) para un grupo privado. Para un servidor público dejá
    ARCHIVOS=propios: cada jugador usa sus archivos de CS 1.6."
    fi
    ;;
esac
env_set MODO "$MODO"
env_set BIND_WEB "$BIND_WEB"
env_set BIND_UDP "$BIND_UDP"
env_set IP_PUBLICA "$IP_PUB"
env_set URL_JUEGO "$URL"
env_set CONFIAR_PROXY "$PROXY"
env_set HOST_UID "$(id -u):$(id -g)"

# Salas: si no hay config/salas.conf se arma uno (en modo online: con bots, más bots y solo humanos)
if [ ! -s config/salas.conf ]; then
  nombre=$(env_get NOMBRE_SERVIDOR | sed 's/|/·/g')
  {
    sed -n '1,/^# ---/p' config/salas.conf.ejemplo
    printf '# id | nombre | mapa | jugadores | bots | dificultad\n'
    if [ "$MODO" = "online" ]; then
      printf '1 | %s · Clásico | de_dust2   | 12 | 4 | 1\n' "$nombre"
      printf '2 | %s · Inferno | de_inferno | 12 | 2 | 2\n' "$nombre"
      printf '3 | %s · Solo humanos | de_dust2 | 12 | 0 | 0\n' "$nombre"
    else
      printf '1 | %s | %s | %s | %s | %s\n' "$nombre" "$(env_get MAPA)" "$(env_get MAX_JUGADORES)" \
        "$(env_get BOTS)" "$(env_get BOTS_DIFICULTAD)"
    fi
  } > config/salas.conf
  ok "Salas en config/salas.conf (editalo para agregar más)"
fi

limpiar() { printf '%s' "$1" | tr -d '"\\/&;|'; }
sed -e "s/{{RCON}}/$(limpiar "$(env_get RCON_PASSWORD)")/" -e "s/{{CHEATS}}/$TRAMPAS/" \
    -e "s/{{NOMBRE}}/$(limpiar "$(env_get NOMBRE_SERVIDOR)")/" -e "s/{{CONTRASENA}}/$(limpiar "$(env_get CONTRASENA)")/" \
  config/server.cfg.template > config/server.cfg.tmp
mv config/server.cfg.tmp config/server.cfg
chmod 644 config/server.cfg
mkdir -p build texturas mapas metricas
# la web corre con el usuario 1000 y guarda ahí las métricas
if [ "$(uname -s)" = Linux ] && [ "$(id -u)" = 0 ]; then chown 1000:1000 metricas; fi
ok "Configuración lista (contraseñas en .env; archivos del juego: $(env_get ARCHIVOS))"

PERFIL=()
SERVICIOS=(servidor web studio)
if [ "$MODO" = "online" ]; then
  PERFIL=(--profile online)
  SERVICIOS+=(caddy)
fi

# ---------------------------------------------------------------- 3. Imágenes
paso "Armando las imágenes de Docker (la primera vez tarda unos minutos)"
docker compose build servidor web studio || falla "No pude armar las imágenes. Revisá tu conexión a internet y volvé a correr ./start.sh"
ok "Imágenes listas"

# ------------------------------------------------- 4. Archivos del juego (1 vez)
bajar_juego

# ------------------------------------------------------- 5. Paquetes del juego
paso "Armando los paquetes del juego (valve.zip y mod.zip) con tus personajes"
docker compose run --rm --no-deps studio python -m app.cli build || falla "No pude armar los paquetes del juego."

# ------------------------------------------------------------- 6. Levantar
paso "Levantando las salas"
# (${PERFIL[@]+...}: el bash 3.2 de macOS no acepta un arreglo vacío con set -u)
docker compose ${PERFIL[@]+"${PERFIL[@]}"} up -d --remove-orphans "${SERVICIOS[@]}"
# El estudio se recrea siempre: si build/juego cambió con el estudio prendido, la carpeta
# compartida le queda vieja ("Operation not permitted").
docker compose up -d --no-deps --force-recreate studio

if ! esperar 90 "La página del juego responde" curl -fsS -o /dev/null "http://$DIR_WEB:27016/api/status"; then
  docker compose logs --tail 40 servidor web || true
  falla "La página del juego no responde. Arriba están los últimos mensajes."
fi
esperar 60 "El estudio responde" curl -fsS -o /dev/null "http://127.0.0.1:27080/api/status" \
  || aviso "El estudio todavía no responde; mirá «docker compose logs studio»."
printf '  … esperando que las salas carguen el mapa (en una Mac con chip M puede tardar un par de minutos)\n'
if ! esperar 300 "Las salas están en línea" servidor_en_linea; then
  docker compose logs --tail 40 servidor || true
  aviso "Las salas todavía no responden. Pueden seguir cargando: mirá «docker compose logs -f servidor»."
fi
if [ "$MODO" = "online" ]; then
  esperar 120 "HTTPS listo en $URL" curl -fsS -o /dev/null "$URL/api/status" \
    || aviso "Todavía no responde $URL. Revisá que los puertos 80, 443 (TCP) y 27018 (UDP) estén abiertos y que el dominio apunte a $IP_PUB."
fi

printf '\n  %s✅ Listo%s\n\n' "$_B" "$_N"
printf '  Juego:    %s\n' "$URL"
printf '  Estadísticas: %s/estadisticas?clave=%s   (cuánta gente entra; también: bash estadisticas.sh)\n' "$URL" "$(env_get CLAVE_ESTADISTICAS)"
printf '  Estudio:  http://localhost:27080   (solo desde esta compu%s)\n' "$( [ "$MODO" = online ] && printf '; desde la tuya: ssh -L 27080:localhost:27080 este-servidor' )"
case "$MODO" in
  lan) printf '\n  Pasale el link del juego a quien esté en tu misma red.\n' ;;
  online) printf '\n  Ese link funciona desde cualquier lado. Salas: config/salas.conf · Archivos del juego: %s\n' "$(env_get ARCHIVOS)" ;;
esac
printf '\n  Comandos de las salas:  ./servidor.sh "yb add"   ./servidor.sh --sala 2 "changelevel de_inferno"\n'
printf '  Para apagar todo:       ./stop.sh\n\n'

#!/usr/bin/env bash
# Abre el juego después de bash cerrar.sh: prende las salas y saca el cartel (las páginas
# que estaban abiertas se recargan solas en menos de un minuto).
set -euo pipefail
cd "$(dirname "$0")"
docker compose start servidor >/dev/null
rm -f marca/web/cerrado.txt
echo "Abierto. Las salas tardan unos segundos en prender."

#!/usr/bin/env bash
# Cierra el juego hasta nuevo aviso: la página muestra un cartel («Cerrado por ahora» y tu
# mensaje) y las salas se apagan. La página sigue en línea; nadie puede entrar a jugar.
#   bash cerrar.sh "Volvemos mañana a las 20 h"
# Para abrir de nuevo: bash abrir.sh
set -euo pipefail
cd "$(dirname "$0")"
mensaje="${*:-Volvemos pronto.}"
printf '%s\n' "$mensaje" > marca/web/cerrado.txt
docker compose stop servidor >/dev/null
echo "Cerrado. La página muestra: «$mensaje»"
echo "Para abrir de nuevo: bash abrir.sh"

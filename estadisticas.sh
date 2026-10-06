#!/usr/bin/env bash
# Muestra el link a las estadísticas (cuánta gente abrió la página, quién jugó, cuánto).
#   bash estadisticas.sh
set -euo pipefail
cd "$(dirname "$0")"
. scripts/comun.sh
clave="$(env_get CLAVE_ESTADISTICAS)"
[ -n "$clave" ] || falla "Todavía no hay clave de estadísticas: corré bash deploy/instalar-vps.sh (o ./start.sh) una vez."
url="$(env_get URL_JUEGO)"
[ -n "$url" ] || url="http://localhost:27016"
printf '\n  Estadísticas:  %s/estadisticas?clave=%s\n' "$url" "$clave"
printf '  (también funciona con tu dirección de Vercel: …vercel.app/estadisticas?clave=%s)\n\n' "$clave"

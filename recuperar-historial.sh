#!/usr/bin/env bash
# Suma a las estadísticas las partidas de antes de que existieran, desde el registro de la
# web (quién entró y salió de cada sala, a qué hora). Se corre una sola vez:
#   bash recuperar-historial.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p metricas
docker compose logs -t --no-color web 2>/dev/null | python3 scripts/recuperar_historial.py metricas

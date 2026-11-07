#!/usr/bin/env bash
# Publica este proyecto como repositorio público en GitHub (se corre una sola vez).
#
#   ./publicar-en-github.sh                 crea github.com/<tu-usuario>/sla-cs16-web
#   ./publicar-en-github.sh otro-nombre     con otro nombre
#
# Usa «gh», la herramienta oficial de GitHub. Si no la tenés:
#   Mac:   brew install gh        Linux/Windows: https://cli.github.com
# La primera vez te pide entrar a tu cuenta de GitHub en el navegador.
#
# Antes de subir revisa que no vayan contraseñas (.env), archivos del juego (build/) ni
# tus texturas (texturas/): todo eso queda solo en tu compu.
set -euo pipefail
cd "$(dirname "$0")"
. scripts/comun.sh

NOMBRE="${1:-sla-cs16-web}"
DESCRIPCION="Counter-Strike 1.6 en el navegador: salas con bots y estudio de personajes. Comunidad SLA."

command -v git >/dev/null 2>&1 || falla "Falta git (en Mac: xcode-select --install)."
if ! command -v gh >/dev/null 2>&1; then
  cat <<TXT

  Falta «gh», la herramienta de GitHub.
    Mac:   brew install gh      (si no tenés brew: https://brew.sh)
    Otros: https://cli.github.com

  También lo podés subir a mano: creá un repositorio vacío en https://github.com/new
  llamado «$NOMBRE» y después corré:
    git remote add origin https://github.com/TU-USUARIO/$NOMBRE.git
    git push -u origin main

TXT
  exit 1
fi
[ -d .git ] || falla "Esta carpeta no es un repositorio de git."

paso "Revisando que no se suba nada privado"
if git ls-files | grep -E '^(\.env|build/|config/server\.cfg$|config/salas\.conf$)|^texturas/.+\.png$'; then
  falla "Esos archivos no tienen que estar en git (son privados o pesados). Sacalos con «git rm --cached»."
fi
if git ls-files | grep -iE '\.(bsp|mdl|spr|wad)$' | grep -v '^mapas/'; then
  falla "Hay archivos del juego en git (¿de Valve?). No se pueden publicar."
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  aviso "Hay cambios sin guardar en git; se publica lo último guardado (git commit)."
fi
ok "Nada privado ni de Valve"

paso "Entrando a GitHub"
gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https
USUARIO=$(gh api user --jq .login)
ok "Cuenta: $USUARIO"

paso "Creando github.com/$USUARIO/$NOMBRE"
git branch -M main
if gh repo view "$USUARIO/$NOMBRE" >/dev/null 2>&1; then
  aviso "Ya existe: subo lo nuevo."
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$USUARIO/$NOMBRE.git"
  git push -u origin main
else
  gh repo create "$NOMBRE" --public --source . --remote origin --push --description "$DESCRIPCION"
fi

# Los links de la documentación apuntan al repo real
if grep -rqs 'USUARIO/REPO' README.md docs/ deploy/; then
  for f in README.md docs/online.md deploy/instalar-vps.sh; do
    sed "s#USUARIO/REPO#$USUARIO/$NOMBRE#g" "$f" > "$f.tmp" && cat "$f.tmp" > "$f" && rm -f "$f.tmp"
  done
  git add README.md docs/online.md deploy/instalar-vps.sh
  git commit -q -m "Links al repositorio $USUARIO/$NOMBRE"
  git push -q
fi
gh repo edit "$USUARIO/$NOMBRE" --enable-issues \
  --add-topic counter-strike --add-topic cs16 --add-topic webassembly --add-topic xash3d >/dev/null 2>&1 || true

printf '\n  %s✅ Publicado%s  https://github.com/%s/%s\n\n' "$_B" "$_N" "$USUARIO" "$NOMBRE"
printf '  Para ponerlo online en un servidor: ver docs/online.md\n\n'

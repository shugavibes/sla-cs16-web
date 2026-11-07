# Cómo contribuir

¡Gracias por querer sumar! Este proyecto es de la comunidad de SLA y está abierto a
mejoras de código, mapas, personajes, traducciones y documentación.

*English: contributions in English are welcome. Same rules apply — especially the legal
ones below.*

## Levantarlo

```bash
./start.sh           # todo en tu compu (necesita Docker)
```

Las partes que más vas a tocar se ven **sin rearmar nada**:

- `web/cliente/` (salas, equipo, archivos propios) y `marca/web/`:
  recargá la página del juego.
- `marca/juego/`, `mapas/` y los personajes: «Aplicar al juego» en el estudio
  (o `./texturas.sh aplicar`) y recargá.

Lo demás (`web/*.mjs`, `servidor/`, `studio/app/`, `docker-compose.yml`) se aplica con
`./start.sh`.

## Pruebas

```bash
cd web && npm ci && cd ..
node --test web/*.test.mjs web/cliente/*.test.mjs
(cd studio && pip install -r requirements.txt pytest && pytest -q)
shellcheck -x start.sh stop.sh servidor.sh texturas.sh publicar-en-github.sh scripts/*.sh deploy/*.sh
shellcheck -s sh servidor/entrypoint.sh servidor/preparar-motor.sh
```

GitHub Actions corre todo esto (y arma las imágenes) en cada pull request.

## Qué se acepta

- **Código:** arreglos y mejoras con una descripción clara de qué cambia y cómo lo
  probaste. Si cambia la lógica de gestos, salas o archivos, sumá o ajustá las pruebas.
- **Mapas** (`mapas/`): tuyos o con una licencia que permita compartirlos. En el PR
  poné de dónde salen, quién los hizo y la licencia. Ver `mapas/LEEME.md`.
- **Personajes / skins:** texturas propias aplicadas con el estudio. Mandá el PNG y el
  modelo al que va, no el `.mdl` completo.
- **Traducciones y documentación:** siempre bienvenidas.

## Qué NO se acepta

- **Archivos de Valve** (mapas oficiales, modelos, sonidos, texturas o el `valve.zip`).
  Cada instalación los baja con SteamCMD y cada jugador usa los suyos en los servidores
  públicos. Un PR con archivos de Valve se cierra.
- Contenido de otros juegos o sin licencia clara.
- Binarios sin código fuente (`.dll`, `.so`, `.exe`) y cheats.
- Cambios a la marca SLA (`marca/`) sin acordarlo antes con SLA. Para tu comunidad,
  hacé un fork y reemplazá esa carpeta.

## Estilo

- Textos para la gente en español rioplatense, claros y cortos («tocá», «elegí»).
- Nombres en español en el código propio; lo que viene de otros proyectos se deja igual.
- Shell compatible con el bash 3.2 de macOS en los scripts de la compu, y POSIX `sh` en
  `servidor/entrypoint.sh`.

## Seguridad

Si encontrás una vulnerabilidad, no abras un issue público: escribí a los mantenedores
por privado (en GitHub, *Security → Report a vulnerability*). Respondemos lo antes posible.

## Convivencia

Tratá bien a la gente. Sin agresiones, discriminación ni acoso, en el código, los issues
o el juego. Los mantenedores pueden cerrar o bloquear lo que no respete esto.

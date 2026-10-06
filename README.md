# SLA · Counter-Strike 1.6 en el navegador

Counter-Strike 1.6 que se juega desde el navegador, sin instalar nada, con la marca de
[SLA](https://slatv.live). Trae salas con bots, un **estudio de personajes** para
cambiarles las texturas, y un modo para **apuntar y disparar con la mano** usando la
cámara.

**🎮 Jugar ahora: [sla-cs.vercel.app](https://sla-cs.vercel.app)** (el servidor de la comunidad
SLA; pedí la contraseña en SLA).

> **English summary.** Counter-Strike 1.6 in the browser (Xash3D FWGS compiled to
> WebAssembly) with dedicated servers in Docker, a WebRTC ⇄ UDP bridge, multiple rooms,
> a character texture studio and hand-tracking controls (MediaPipe). Public servers ask
> each player for their own CS 1.6 files (from Steam); no Valve content is in this repo.
> Docs are in Spanish; issues and PRs in English are welcome too.

| | |
|---|---|
| 🎮 **Jugar** | En el navegador (Chrome, Edge, Firefox o Safari). Con mouse y teclado, o con la mano. |
| 🏠 **Salas** | Varias salas por servidor, cada una con su mapa, cupo y bots. Se elige al entrar. |
| ✋ **Manos** | Pistolita con la mano: el índice apunta, bajar el pulgar dispara, mano abierta recarga. |
| 🎨 **Estudio** | Cambiá la ropa de los personajes y velos en 3D antes de aplicarlo al juego. |
| 🌐 **Online** | Un comando instala todo en un servidor alquilado, con HTTPS. |

## Jugar en tu compu

Necesitás [Docker Desktop](https://www.docker.com/products/docker-desktop/) (gratis
para uso personal; en Mac con chip M, la versión «Apple Silicon») y unos 3 GB de disco.
No hace falta tener Counter-Strike: el servidor baja los archivos del juego con SteamCMD,
la herramienta oficial y gratuita de Valve para servidores.

```bash
git clone https://github.com/shugavibes/sla-cs16-web.git cs16-web
cd cs16-web
./start.sh
```

La primera vez tarda (10 a 20 minutos en una Mac con chip M): arma las imágenes, baja
los archivos del juego (~600 MB) y prepara todo. Después arranca en un minuto.

- **Juego:** `http://localhost:27016` (en tu compu, después de `./start.sh`): poné tu
  nombre, elegí sala y equipo, y «Jugar».
- **Estudio:** `http://localhost:27080` (también en tu compu): para editar los personajes.
- `./start.sh lan` lo abre a tu red (Wi-Fi). `./stop.sh` apaga todo.

### Dentro del juego

- **WASD** moverse · **B** comprar · **M** cambiar de equipo · **Tab** puntajes · **Esc** menú.
- **Consola:** la tecla de al lado del 1 (en teclados en español, la de «º»).
- No hay flechita del mouse: hacés clic, el navegador «atrapa» el mouse y apuntás con la
  mira. **Esc** lo suelta.
- **⌥ Option + H** (Alt + H): cambiar entre la mano y el mouse cuando quieras.
- En pantallas Retina y celulares los textos (nombres, quién mató a quién, chat, menús) y
  el resto del HUD se agrandan solos (al doble en una Mac con Retina). Para elegir otro tamaño, agregá `?hud=1.5`
  a la dirección (de 1 a 3; `?hud=1` lo deja como en la versión original).

## Jugar con la mano

Tildá **«Apuntar con la mano»** al entrar (o en el juego apretá **⌥/Alt + H**). El
navegador pide la cámara.

- Hacé una **pistolita**: la mira sigue la punta del **índice**. Con la mano cerca del
  borde de la imagen, la vista sigue girando.
- **Bajá el pulgar** como un gatillo para disparar.
- **Mano abierta** un momento: recarga.

Abajo a la izquierda hay un panel con lo que ve la cámara y botones de sensibilidad. La
detección corre en tu navegador (MediaPipe Hands, guardado en el proyecto): la imagen de
la cámara no sale de tu compu. Código y pruebas en `web/cliente/manos/`.

## Salas

Cada línea de `config/salas.conf` es un servidor de CS aparte:

```
# id | nombre          | mapa       | jugadores | bots | dificultad
1    | SLA · Clásico   | de_dust2   | 12        | 4    | 0
2    | SLA · Inferno   | de_inferno | 12        | 2    | 1
```

Se aplican con `./start.sh`. Comandos para las salas:

```bash
./servidor.sh "yb add"                        # agrega un bot en la sala 1
./servidor.sh --sala 2 "changelevel de_nuke"  # cambia el mapa de la sala 2
./servidor.sh --todas "say Hola"              # a todas las salas
```

## Online

```bash
# en un servidor Ubuntu recién creado (x86, 2 CPU / 4 GB alcanzan):
curl -fsSL https://raw.githubusercontent.com/shugavibes/sla-cs16-web/main/deploy/instalar-vps.sh \
  | sudo REPO=https://github.com/shugavibes/sla-cs16-web.git bash
```

Instala Docker, abre solo los puertos necesarios, pone HTTPS automático y levanta tres
salas (con bots, con más bots y solo humanos). En los servidores públicos **cada jugador usa sus propios archivos de CS 1.6**
(los elige una vez desde su compu y quedan en su navegador; no se suben a ningún lado):
así no se reparte contenido de Valve. Todo el detalle — arquitectura, dominios, costos,
cómo crecer — en **[docs/online.md](docs/online.md)**.

## Personajes y marca

**Estudio** (`http://localhost:27080`, en tu compu): elegí un personaje, cambiá sus texturas (ajuste de
color, una imagen propia, o editando los PNG con tu programa) y tocá «Aplicar al juego».
La forma del personaje y dónde pegan los tiros no cambian. Desde la terminal:
`./texturas.sh lista | exportar <id> | aplicar`.

**Marca** (`marca/`): logo, colores y textos de la página (`marca/web/`, se ve al
recargar) y lo que va dentro del juego (`marca/juego/`: colores del menú y del HUD).
`marca/fuente/generar.py` arma todo a partir del logo y `marca/fuente/logo_personajes.py`
pone el logo en la espalda y el pecho de los personajes. Para tu propia comunidad,
reemplazá esa carpeta.

**Mapas de la comunidad** (`mapas/`): lo que pongas ahí se suma a las salas y a los
jugadores. Ver [mapas/LEEME.md](mapas/LEEME.md).

## Cómo está armado

| Parte | Qué hace |
|---|---|
| `servidor/` | Las salas: servidores dedicados de CS 1.6 ([Xash3D FWGS](https://github.com/FWGS/xash3d-fwgs) + [ReGameDLL_CS](https://github.com/rehlds/ReGameDLL_CS) + bots [YaPB](https://github.com/yapb/yapb)). Linux 32 bits. |
| `web/` | Node: la página (motor en WebAssembly, de [CSweb](https://github.com/santiagoPostacchini/CSweb)), estado de las salas, paquetes del juego y puente WebRTC ⇄ UDP. |
| `web/cliente/` | Lo propio de la página: salas, equipo, archivos propios, celular, textos grandes y control con la mano. |
| `studio/` | Estudio de personajes (Python): texturas de los `.mdl`, arma `valve.zip` y `mod.zip`. |
| `marca/` | Marca SLA (página y juego). |
| `mapas/` | Mapas y archivos de la comunidad. |
| `caddy/`, `deploy/` | HTTPS e instalador para el modo online. |
| `docs/` | Documentación (online, arquitectura). |

Pruebas: `node --test web/*.test.mjs web/cliente/*.test.mjs web/cliente/manos/*.test.mjs`
y `cd studio && pytest`. Corren solas en cada pull request (GitHub Actions).

## Contribuir

¡Bienvenidas las mejoras, mapas, skins y traducciones! Leé
[CONTRIBUTING.md](CONTRIBUTING.md): cómo levantar el proyecto, qué se acepta y qué no
(en particular: nada de archivos de Valve ni contenido sin licencia).

## Seguridad

- En modo local todo escucha solo en tu compu; el estudio nunca se publica.
- Las salas solo escuchan dentro del servidor; la contraseña de RCON se genera al azar y
  queda en `.env` (que no se sube a git, igual que `build/` y `texturas/`).
- Contenedores sin privilegios, de solo lectura donde se puede y con límites de memoria.
- Si encontrás un problema de seguridad, avisá en privado (ver CONTRIBUTING.md).

## Si algo falla

- **Falla la descarga de los archivos del juego:** volvé a correr `./start.sh`
  (SteamCMD a veces falla de a ratos). Si tenés CS 1.6 en Steam, también podés copiar
  las carpetas `valve` y `cstrike` a `build/juego/`.
- **«Jugar» dice «Esperando al servidor…»:** las salas tardan en cargar el mapa (en
  Mac, un par de minutos). `docker compose logs -f servidor` muestra qué pasa.
- **No veo mis cambios del estudio:** ¿tocaste «Aplicar al juego»? Después recargá.

## Licencia y créditos

El código de este proyecto es **MIT** ([LICENSE](LICENSE)). Los componentes de terceros
mantienen sus licencias (GPL, MIT, Apache…): ver
[LICENCIAS-DE-TERCEROS.md](LICENCIAS-DE-TERCEROS.md). La marca y el logo de SLA no
están bajo esa licencia.

Counter-Strike y Half-Life son de Valve. Este proyecto no está afiliado a Valve y **no
incluye archivos de Valve**: el servidor los baja con SteamCMD y en los servidores
públicos cada jugador usa los suyos.

Gracias a [CSweb](https://github.com/santiagoPostacchini/CSweb),
[webxash3d-fwgs](https://github.com/yohimik/webxash3d-fwgs),
[Xash3D FWGS](https://github.com/FWGS/xash3d-fwgs),
[CS16Client](https://github.com/Velaron/cs16-client), [ReGameDLL_CS](https://github.com/rehlds/ReGameDLL_CS),
[YaPB](https://github.com/yapb/yapb) y [MediaPipe](https://github.com/google/mediapipe).

# Licencias de terceros

El código propio de este proyecto es MIT (ver `LICENSE`). Usa estos componentes, cada
uno con su licencia:

| Componente | Para qué | Licencia | Dónde |
|---|---|---|---|
| [Xash3D FWGS](https://github.com/FWGS/xash3d-fwgs) | Motor del juego (servidor y navegador) | GPL-3.0 | Binarios Linux bajados al armar la imagen (`servidor/`); versión WebAssembly dentro de `web/public/assets/` |
| [webxash3d-fwgs](https://github.com/yohimik/webxash3d-fwgs) | Paquetes `xash3d-fwgs` y `cs16-client` para el navegador | MIT (código propio) + licencias de lo que compila | `web/public/assets/` |
| [CS16Client](https://github.com/Velaron/cs16-client) | Cliente de CS 1.6, lógica del juego y bots | GPL-2.0+ con excepción para el motor de Half-Life | `web/public/assets/`, binarios bajados al armar `servidor/` |
| [ReGameDLL_CS](https://github.com/rehlds/ReGameDLL_CS) | Lógica de CS del servidor (`cs.so`) | GPL-3.0 | Binario bajado al armar `servidor/` |
| [YaPB](https://github.com/yapb/yapb) | Bots | MIT | Binario bajado al armar `servidor/` |
| [CSweb](https://github.com/santiagoPostacchini/CSweb) | Cliente web y puente WebRTC (base de `web/`) | MIT | `web/public/`, `web/rtc.mjs`, `web/servidor.mjs` (ver `web/LICENCIA-CSweb.txt`) |
| [fflate](https://github.com/101arrowz/fflate) | Descompresión de los paquetes en el navegador | MIT | Dentro de `web/public/assets/index-*.js` |
| [three.js](https://github.com/mrdoob/three.js) | Visor 3D del estudio | MIT | `studio/static/vendor/` |
| [Geist](https://github.com/vercel/geist-font) | Tipografía de la marca SLA | SIL OFL 1.1 | `marca/web/fuentes/`, `marca/fuente/fuentes/` |
| [node-datachannel](https://github.com/murat-dogan/node-datachannel) | WebRTC en el servidor | MPL-2.0 | Dependencia npm de `web/` |
| [ws](https://github.com/websockets/ws) | WebSocket | MIT | Dependencia npm de `web/` |
| [Pillow](https://python-pillow.org/) | Texturas en el estudio | MIT-CMU (HPND) | Dependencia pip de `studio/` |
| [Caddy](https://caddyserver.com/) | HTTPS en modo online | Apache-2.0 | Imagen de Docker `caddy:2-alpine` |

Los binarios con licencia GPL se usan sin modificar; su código fuente está en los
enlaces de arriba (versiones exactas y sha256 en `servidor/FUENTES.txt` y
`web/FUENTES.txt`).

## Contenido de Valve

Counter-Strike y Half-Life son de Valve. **Este repositorio no incluye ningún archivo de
Valve** (mapas, modelos, sonidos, texturas). Cada instalación los baja con SteamCMD, la
herramienta oficial y gratuita de Valve para servidores. En los servidores públicos
(modo `ARCHIVOS=propios`) cada jugador usa sus propios archivos de Counter-Strike 1.6.
Este proyecto no está afiliado a Valve.

## Marca SLA

El nombre, el logo y los recursos de marca de SLA (`marca/`) no están bajo la licencia MIT:
son de SLA. Si hacés un fork para tu propia comunidad, reemplazalos por los tuyos.

# Pendiente: lag de animaciones en el servidor online

Investigación del 6/11/2026, sin cerrar. Este documento es para retomarla desde otra
compu: qué se midió, qué se descartó, qué falta y cómo repetir las mediciones. Cuando se
resuelva, lo que siga valiendo pasa a `docs/online.md` y este archivo se borra.

## El síntoma

En local (`./start.sh`, `http://localhost:27016`) el juego anda perfecto. Online
(`https://sla-cs.vercel.app`) se laguea, y lo más notorio son las animaciones del
personaje: los movimientos del arma y de los brazos.

## Qué se descartó

- **Vercel.** `vercel/vercel.json` solo reescribe la página hacia
  `https://64-176-27-186.sslip.io`. La página pone `window.cs16Servidor` y el navegador abre
  la señalización y el canal WebRTC (UDP 27018) directo contra el VPS.
- **El puente WebRTC ⇄ UDP** (`web/rtc.mjs`). Reenvía cada paquete apenas llega: no tiene
  colas ni envíos en lote.
- **El navegador y la configuración del cliente.** Online corre a 60 fps estables y las
  cvars son idénticas a las de local: `cl_lw 1`, `cl_lc 1`, `cl_nopred 0`, `ex_interp 0.1`,
  `cl_updaterate 100`, `cl_cmdrate 100`, `rate 100000`, `fps_max 100`.
- **La predicción del arma.** Esta tabla es el tiempo entre `+attack` y el primer cambio en
  los píxeles del arma:

  | Escenario | Reacción del arma |
  |---|---|
  | Local, `fakelag 0` | 12–23 ms |
  | Local, `fakelag 150` (150 ms de latencia simulada) | 11–19 ms |
  | Online, `cl_lw 1` (lo normal) | 17–33 ms |
  | Online, `cl_lw 0` (sin predicción, como control) | 67–100 ms, el ping |

  El arma propia se predice en el cliente y no espera al servidor.

## Qué se encontró: los paquetes del servidor llegan a rachas

Llegada de paquetes al navegador por el canal WebRTC, en 10 s de juego:

| | Local | Online (sala «Solo humanos», sin bots, un solo jugador) |
|---|---|---|
| Paquetes por segundo | 64,4 | 64,5 |
| Separación típica (p50) | 15,6 ms | 5,2 ms (llegan amontonados) |
| Separación p95 | 17,8 ms | 56,6 ms |
| Hueco máximo | 57 ms | **312 ms** |
| Huecos de más de 100 ms | 0 | **20** |

En otra grabación de 37 s jugando online, 16 de esos segundos tuvieron algún hueco de más
de 100 ms (el máximo fue de 290 ms). La latencia de ida y vuelta que da WebRTC varió entre
31 y 130 ms, con mediana de 48.

Llega la misma cantidad de paquetes que en local, pero amontonados y con silencios de hasta
300 ms. Las animaciones (y los demás jugadores, interpolados con 100 ms de margen por
`ex_interp 0.1`) dependen de que las actualizaciones lleguen parejas, así que esos silencios
se ven como tirones.

**¿Es la red?** Probablemente no del todo. Desde la misma compu y la misma red (Wi-Fi en
Argentina), un ping ICMP continuo al VPS durante 15 s (356 pings) dio:

| Mínimo | p50 | p95 | Máximo | Más de 100 ms | Perdidos |
|---|---|---|---|---|---|
| 28 ms | 38 ms | 60 ms | 172 ms | 4 | 0 |

Hay algo de jitter, pero no alcanza para explicar 20 huecos de hasta 312 ms en 10 s.

## Sospecha principal (sin confirmar): el VPS se queda sin CPU

El VPS (Vultr, Santiago, 2 vCPU compartidas) corre tres salas (`config/salas.conf` del VPS):
«Clásico» con 4 bots, «Inferno» con 2 bots y «Solo humanos» sin bots. Cada sala es un
servidor de CS aparte a `sys_ticrate 128` (`config/server.cfg.template`), y los bots YaPB
juegan aunque la sala esté vacía. Si el servidor de CS no consigue CPU a tiempo (por carga
propia o por *steal* del proveedor), manda los paquetes a rachas: es justo el patrón medido.

No se pudo confirmar porque la medición se hizo sin acceso SSH al VPS.

## Próximos pasos

1. **Mirar la carga del VPS**, desde `/opt/cs16-web`:

   ```bash
   nproc; uptime
   vmstat 1 15                 # columnas "r" (procesos esperando CPU) y "st" (steal)
   docker stats --no-stream
   ```

2. **Dejar una sola sala, «Solo humanos», sin bots.** Es lo que se decidió para probar.
   Sale de `config/salas.conf` del VPS, que no está en git:

   ```bash
   cd /opt/cs16-web
   cp config/salas.conf config/salas.conf.antes
   sed -i -E '/^[[:space:]]*[12][[:space:]]*\|/d' config/salas.conf
   grep -v '^#' config/salas.conf        # tiene que quedar solo la sala 3
   ./start.sh online                     # el dominio lo toma de .env; corta unos segundos a quien esté jugando
   ```

   Se deja la sala 3 para que a quien la tenga guardada como elegida le siga entrando
   directo. Para volver atrás: `cp config/salas.conf.antes config/salas.conf && ./start.sh online`.

3. **Volver a medir** los huecos (ver abajo). Si los de más de 100 ms bajan de unos 20 a
   cerca de 0 en 10 s, queda confirmado. Si siguen, las opciones son: bajar
   `sys_ticrate`, pasar a un VPS con CPU dedicada, o, si resultara la red, subir `ex_interp`
   en el cliente.

4. **Decidir el default.** `start.sh` (líneas 157–159), en modo online y sin
   `config/salas.conf`, arma tres salas, dos con bots, y `docs/online.md` (línea 96) lo
   describe así. Si se confirma que los bots en salas vacías cuestan demasiado, conviene
   cambiar ese default (o que los bots no jueguen sin humanos) y actualizar la documentación.

## Cómo medir desde el navegador

Todo se corre en la consola de DevTools de la pestaña del juego, ya dentro de una sala.

- **La ventana tiene que estar al frente.** Si no, el navegador baja la pestaña a unos
  8 fps y los números no sirven. El motor tarda unos 4 ms por cuadro: los 8 fps no son del
  juego, son del navegador frenando la pestaña.
- **Accesos al motor:** `window.xash` es el motor.
  - `xash.Cmd_ExecuteString(cmd)` ejecuta un comando de consola.
  - `await xash.getCVar(nombre)` lee una cvar. Es asíncrono, y con una cvar que no existe no
    responde nunca: conviene envolverlo en `Promise.race` con un timeout.
  - `xash.channel` es el `RTCDataChannel` del juego y `xash.peer`, el `RTCPeerConnection`.
  - `window.cs16Sala` es la sala elegida.

**Huecos de paquetes (10 s):**

```js
const ch = xash.channel, t = [];
const on = () => t.push(performance.now());
ch.addEventListener('message', on);
await new Promise(r => setTimeout(r, 10000));
ch.removeEventListener('message', on);
const g = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
({ porSeg: t.length / 10, p50: g[g.length >> 1], p95: g[Math.floor(g.length * .95)],
   max: g.at(-1), mayoresA100: g.filter(x => x > 100).length })
```

**Latencia de WebRTC:** en `await xash.peer.getStats()`, el `candidate-pair` con
`nominated: true` tiene `currentRoundTripTime`.

**Reacción del arma:** desde un `requestAnimationFrame`, copiar con `drawImage` la región
del arma del canvas WebGL (x de 50 a 80 %, y de 55 a 100 % del ancho y el alto) a un canvas
2D de 48×48. Tomar esa copia como base y mandar `+attack` y, 40 ms después, `-attack`. La
reacción es el tiempo hasta que la diferencia media de color con la base supera ~6.

**Simular latencia en local:** el motor tiene `fakelag <ms>` y `fakeloss`. Hay que dejarlos
en 0 al terminar.

**Ping fino desde Windows** (PowerShell, 15 s seguidos):

```powershell
$p = New-Object System.Net.NetworkInformation.Ping; $r = @(); $sw = [Diagnostics.Stopwatch]::StartNew()
while ($sw.ElapsedMilliseconds -lt 15000) { $x = $p.Send('64.176.27.186', 1000); $r += $(if ($x.Status -eq 'Success') { $x.RoundtripTime } else { 1000 }) }
$s = $r | Sort-Object; "n=$($r.Count) p50=$($s[[int]($s.Count/2)]) p95=$($s[[int]($s.Count*0.95)]) max=$($s[-1]) mayores100=$(($r | ? {$_ -gt 100}).Count)"
```

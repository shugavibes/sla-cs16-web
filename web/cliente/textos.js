// Textos del juego más grandes: nombres, quién mató a quién, chat, menú de compra, tabla
// de puntajes...
//
// El juego dibuja con la resolución real de la pantalla. En las de alta densidad (Mac con
// Retina, celulares) cada píxel «normal» son 2 o 3 del juego, y el HUD quedaba a la mitad
// o a un tercio de su tamaño. El motor trae hud_scale, que agranda todo el HUD parejo
// (textos, íconos, números y menús, sin que se encimen). Se pone según la densidad de la
// pantalla (en una Mac con Retina, el doble) justo antes de conectarse a la sala, que es
// cuando el juego arma el HUD, y se ajusta si cambia el tamaño de la ventana o se gira el
// celular (el juego rearma el HUD en ese momento).
//   - En una pantalla común (densidad 1) queda como estaba.
//   - Nunca se agranda tanto que el HUD quede más chico que 640 × 480 (el tamaño mínimo
//     de CS: más chico, los menús no entran); en una ventana muy angosta queda como estaba.
//   - Con ?hud=1 en la dirección no se agranda; ?hud=1.5 (de 1 a 3) elige otra escala.

const MAXIMO = 3;
const MINIMO_ANCHO = 640;
const MINIMO_ALTO = 480;
const CONEXION = /^\s*(connect|reconnect|retry)\b/i;

// Escala del HUD, de a cuartos: la densidad de la pantalla (o la elegida), entre 1 y 3, y
// sin que el HUD quede más chico que 640 × 480 (ancho y alto en píxeles de la página)
export function escalaHud({ densidad = 1, ancho = 0, alto = 0, elegida = null } = {}) {
    const d = Number(densidad) > 0 ? Number(densidad) : 1;
    const pedida = elegida === null || elegida === '' ? NaN : Number(elegida);
    let e = Math.min(MAXIMO, Number.isFinite(pedida) ? pedida : d);
    if (ancho > 0 && alto > 0) e = Math.min(e, (ancho * d) / MINIMO_ANCHO, (alto * d) / MINIMO_ALTO);
    return Math.max(1, Math.floor(e * 4) / 4);
}

// Engancha el motor: antes de cada «connect» que mande la página manda hud_scale.
// Devuelve una función para volver a mandarlo si cambió (por ejemplo, al girar el celular).
export function engancharMotor(motor, comando) {
    if (!motor || motor.cs16Textos || typeof motor.Cmd_ExecuteString !== 'function') return null;
    const original = motor.Cmd_ExecuteString;
    let ultimo = null;
    const mandar = (forzar = false) => {
        const c = comando();
        if (!c || (c === ultimo && !forzar)) return;
        ultimo = c;
        original.call(motor, c);
    };
    motor.cs16Textos = true;
    motor.Cmd_ExecuteString = function (texto, ...resto) {
        if (typeof texto === 'string' && CONEXION.test(texto)) mandar(true);
        return original.call(this, texto, ...resto);
    };
    // Si ya estaba jugando (enganche tardío), se aplica en el próximo cambio de mapa o de tamaño
    if (motor.running) mandar();
    return mandar;
}

// Se llama al cargar la página: espera a que exista el motor (aparece al tocar «Jugar»)
export function agrandarTextos({ ventana = globalThis, elegida = null } = {}) {
    const hayEleccion = elegida !== null && elegida !== '';
    if (!hayEleccion && !((ventana.devicePixelRatio || 1) > 1)) return false;   // pantalla común
    const comando = () => `hud_scale ${escalaHud({
        densidad: ventana.devicePixelRatio, ancho: ventana.innerWidth, alto: ventana.innerHeight, elegida,
    })}`;
    let mandar = null;
    const revisar = setInterval(() => {
        mandar = engancharMotor(ventana.xash, comando);
        if (!mandar) return;
        clearInterval(revisar);
        // ventana más grande o más chica, zoom del navegador, celular girado
        ventana.addEventListener?.('resize', () => { if (ventana.xash?.running) mandar(); });
    }, 100);   // entre que aparece el motor y el «connect» pasan segundos (carga de archivos)
    return true;
}

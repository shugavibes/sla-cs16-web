// Textos del juego más grandes: nombres, quién mató a quién, chat, menú de compra, tabla
// de puntajes...
//
// El juego dibuja con la resolución real de la pantalla. En las de alta densidad (Mac con
// Retina, celulares) cada píxel «normal» son 2 o 3 del juego, y el HUD quedaba a la mitad
// o a un tercio de su tamaño. El motor trae hud_scale, que agranda todo el HUD parejo
// (textos, íconos, números y menús, sin que se encimen). Se pone según la densidad de la
// pantalla (en una Mac con Retina, el doble) justo antes de conectarse a la sala, que es
// cuando el juego arma el HUD.
//   - En una pantalla común (densidad 1) queda como estaba.
//   - Si la ventana es muy angosta (el HUD quedaría de menos de 640 de ancho), el motor no
//     lo aplica y también queda como estaba.
//   - Con ?hud=1 en la dirección no se agranda; ?hud=1.5 (de 1 a 3) elige otra escala.

const MAXIMO = 3;
const CONEXION = /^\s*(connect|reconnect|retry)\b/i;

// Escala del HUD: la densidad de la pantalla (o la elegida), entre 1 y 3, de a cuartos
export function escalaHud(densidad, elegida = null) {
    const pedida = elegida === null || elegida === '' ? NaN : Number(elegida);
    const base = Number.isFinite(pedida) ? pedida : Number(densidad) || 1;
    return Math.round(Math.min(MAXIMO, Math.max(1, base)) * 4) / 4;
}

export function comandosHud(escala) {
    return escala > 1 ? [`hud_scale ${escala}`] : [];
}

// Antes de cada «connect» que mande la página, manda también los comandos del HUD
export function engancharMotor(motor, comandos) {
    if (!motor || motor.cs16Textos || typeof motor.Cmd_ExecuteString !== 'function') return false;
    const original = motor.Cmd_ExecuteString;
    motor.cs16Textos = true;
    motor.Cmd_ExecuteString = function (comando, ...resto) {
        if (typeof comando === 'string' && CONEXION.test(comando)) {
            for (const c of comandos) original.call(this, c);
        }
        return original.call(this, comando, ...resto);
    };
    // Si ya estaba jugando (enganche tardío), se aplica en el próximo cambio de mapa o de tamaño
    if (motor.running) for (const c of comandos) original.call(motor, c);
    return true;
}

// Se llama al cargar la página: espera a que exista el motor (aparece al tocar «Jugar»)
export function agrandarTextos({ ventana = globalThis, elegida = null } = {}) {
    const escala = escalaHud(ventana.devicePixelRatio, elegida);
    const comandos = comandosHud(escala);
    if (!comandos.length) return escala;
    const revisar = setInterval(() => {
        if (engancharMotor(ventana.xash, comandos)) clearInterval(revisar);
    }, 100);   // entre que aparece el motor y el «connect» pasan segundos (carga de archivos)
    return escala;
}

// Teclas para agacharse sin que el navegador se meta.
//
// En CS uno se agacha con Ctrl y camina despacio con Shift, pero Ctrl+W (o Ctrl+Shift+W)
// es «cerrar la pestaña» en el navegador, y la página no lo puede bloquear: salía el
// cartel de «¿Salir del sitio?» en medio de la partida. Por eso:
//   - Alt (⌥ en la Mac) también agacha, y con Alt no hay atajos peligrosos.
//   - Mientras se juega, Alt no hace lo suyo en el navegador (abrir menús, ir a la barra).
//   - Si igual sale el cartel y te quedás, avisa que uses Alt para agacharte.

const ANTES_DE_CONECTAR = ['bind alt +duck'];
const CONEXION = /^\s*(connect|reconnect|retry)\b/i;

export function engancharMotor(motor, comandos = ANTES_DE_CONECTAR) {
    if (!motor || motor.cs16Teclas || typeof motor.Cmd_ExecuteString !== 'function') return false;
    const original = motor.Cmd_ExecuteString;
    motor.cs16Teclas = true;
    motor.Cmd_ExecuteString = function (texto, ...resto) {
        if (typeof texto === 'string' && CONEXION.test(texto)) for (const c of comandos) original.call(this, c);
        return original.call(this, texto, ...resto);
    };
    if (motor.running) for (const c of comandos) original.call(motor, c);
    return true;
}

export function mensajeSalida(conCtrl) {
    return conCtrl
        ? 'Ctrl+W es «cerrar pestaña» en el navegador: para agacharte usá Alt (⌥ en la Mac), que hace lo mismo.'
        : 'El navegador quiso salir de la página. Si te pasó al agacharte, usá Alt (⌥ en la Mac) en vez de Ctrl.';
}

export function esMac(nav = globalThis.navigator) {
    const p = nav?.userAgentData?.platform || nav?.platform || '';
    return /mac|iphone|ipad|ipod/i.test(p);
}

export function activarTeclas({ ventana = globalThis, avisar = () => {} } = {}) {
    const jugando = () => ventana.document?.body?.classList.contains('playing');
    // En la Mac, ⌥ no tiene atajos del navegador (y sirve para escribir @ y otros en el chat)
    const cuidarAlt = !esMac(ventana.navigator);
    let ctrl = false;

    const revisar = setInterval(() => { if (engancharMotor(ventana.xash)) clearInterval(revisar); }, 100);
    revisar.unref?.();   // (en las pruebas con Node, que no espere al motor)

    ventana.addEventListener('keydown', (e) => {
        if (e.key === 'Control') ctrl = true;
        if (cuidarAlt && jugando() && e.altKey && !e.ctrlKey) e.preventDefault();   // Alt+D, Alt+F: barra y menú
    }, true);
    ventana.addEventListener('keyup', (e) => {
        if (e.key === 'Control') ctrl = false;
        if (cuidarAlt && jugando() && e.key === 'Alt') e.preventDefault();   // Firefox abría su menú al soltar Alt
    }, true);
    ventana.addEventListener('blur', () => { ctrl = false; });

    // El cartel de «¿Salir del sitio?» lo pone la página (así no te saca de golpe). Si la
    // persona se queda, esto corre después de cerrarlo.
    ventana.addEventListener('beforeunload', () => {
        if (!jugando()) return;
        const conCtrl = ctrl;
        setTimeout(() => avisar(mensajeSalida(conCtrl)), 400);
    });
}

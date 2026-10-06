// Radio con Z, X y C.
//
// En CS los menús de radio los manda el servidor. El cliente de CS para la web
// (cs16-client) los muestra solo como botones táctiles: con mouse y teclado no aparecía
// nada al apretar Z, X o C (el menú estaba, invisible, y los números elegían a ciegas).
// Acá, cuando llega un menú de radio se muestra la lista; se elige con los números como
// siempre (los toma el juego, no esta página) y el 0 cierra.

export const MENUS = {
    radioa: {
        titulo: 'Radio · Órdenes',
        tecla: 'Z',
        opciones: ['Cubrime', 'Tomá la delantera', 'Mantengan la posición', 'Reagrúpense',
            'Síganme', 'Me disparan, necesito ayuda'],
    },
    radiob: {
        titulo: 'Radio · Equipo',
        tecla: 'X',
        opciones: ['¡Vamos, vamos!', 'Retirada', 'Manténganse juntos', 'Tomen posiciones y esperen',
            'Ataquen de frente', 'Informen'],
    },
    radioc: {
        titulo: 'Radio · Respuestas',
        tecla: 'C',
        opciones: ['Afirmativo', 'Enemigo a la vista', 'Necesito refuerzos', 'Sector despejado',
            'Estoy en posición', 'Informando', '¡Va a explotar!', 'Negativo', 'Enemigo abatido'],
    },
};

// «execing touch/radioa.cfg»: el juego recibió un menú de radio
const LINEA_RADIO = /execing touch\/(radio[abc])\.cfg/;
const LINEA_OTRO_MENU = /execing touch\/(?!radio|customcmd)/;
const SIN_USO_MS = 20000;

export function menuDeLinea(linea) {
    const m = LINEA_RADIO.exec(String(linea ?? ''));
    return m ? m[1] : null;
}

export function htmlMenu(id) {
    const menu = MENUS[id];
    if (!menu) return '';
    return `<p class="cs16-radio-titulo">${menu.titulo} <kbd>${menu.tecla}</kbd></p><ol>` +
        menu.opciones.map((o, i) => `<li><b>${i + 1}</b> ${o}</li>`).join('') +
        '</ol><p class="cs16-radio-salir"><b>0</b> Cerrar</p>';
}

let caja = null;
let cierre = 0;

function cerrar() {
    if (caja) caja.hidden = true;
    clearTimeout(cierre);
}

function mostrar(id) {
    // con los controles táctiles el juego ya dibuja sus botones de radio
    if (document.body.classList.contains('cs16-tactil-on')) return;
    if (!caja) {
        caja = document.createElement('div');
        caja.className = 'cs16-radio';
        caja.setAttribute('role', 'menu');
        document.body.append(caja);
    }
    caja.innerHTML = htmlMenu(id);
    caja.hidden = false;
    clearTimeout(cierre);
    cierre = setTimeout(cerrar, SIN_USO_MS);
}

export function activarRadio() {
    const original = console.log;
    console.log = function (...args) {
        try {
            const linea = String(args[0] ?? '');
            const id = menuDeLinea(linea);
            if (id) mostrar(id);
            else if (LINEA_OTRO_MENU.test(linea)) cerrar();
        } catch { /* nada */ }
        return original.apply(this, args);
    };
    // el número elige (lo procesa el juego) y el menú se va
    window.addEventListener('keydown', (e) => {
        if (!caja || caja.hidden) return;
        if (/^(Digit|Numpad)\d$/.test(e.code) || e.code === 'Escape') cerrar();
    }, true);
}

// «Cerrado por ahora»: si en el servidor existe marca/web/cerrado.txt (lo crea ./cerrar.sh),
// la página muestra ese mensaje en vez de la entrada y nadie puede tocar «Jugar». Cuando
// se borra (./abrir.sh), la página se recarga sola y vuelve a la normalidad.

const ARCHIVO = '/marca/cerrado.txt';
const REVISAR_MS = 30000;

// Devuelve el mensaje si está cerrado, o null
export async function mensajeCerrado(pedir = globalThis.fetch) {
    try {
        const r = await pedir(ARCHIVO, { cache: 'no-store' });
        if (!r.ok) return null;
        const texto = (await r.text()).trim();
        return texto ? texto.slice(0, 500) : null;
    } catch {
        return null;   // sin red: que se vea la página como siempre
    }
}

function mostrar(mensaje) {
    let caja = document.querySelector('.cs16-cerrado');
    if (!caja) {
        caja = document.createElement('div');
        caja.className = 'cs16-cerrado';
        caja.setAttribute('role', 'alert');
        caja.innerHTML = '<div class="cs16-cerrado-caja"><img src="/marca/sla-logo.svg" alt="SLA">' +
            '<h1>Cerrado por ahora</h1><p></p><small>Esta página se abre sola cuando volvamos.</small></div>';
        document.body.append(caja);
    }
    caja.querySelector('p').textContent = mensaje;
    document.body.classList.add('cs16-esta-cerrado');
    const jugar = document.getElementById('play');
    if (jugar) {
        jugar.disabled = true;
        jugar.dataset.bloqueado = 'cerrado';
    }
}

export async function revisarCerrado() {
    const mensaje = await mensajeCerrado();
    if (!mensaje) return false;
    mostrar(mensaje);
    // cuando lo abran, la página vuelve sola
    setInterval(async () => { if (!(await mensajeCerrado())) location.reload(); }, REVISAR_MS);
    return true;
}

// Archivos propios: en un servidor público cada jugador usa sus archivos de Counter-Strike
// 1.6 (los de Steam). Los elige una vez (la carpeta «Half-Life»), se guardan en este
// navegador (IndexedDB) y NUNCA se suben a ningún lado. El servidor solo manda lo propio
// de la comunidad (mod.zip: personajes, marca, mapas nuevos).
//
// El cliente del juego llama a window.cs16CargarArchivos en vez de bajar valve.zip
// (ver web/parche-cliente.mjs).

// Lo que no hace falta en el navegador (mismas reglas que el paquete del servidor)
const DIRS_FUERA = {
    valve: ['maps', 'media', 'overviews', 'cl_dlls', 'dlls', 'save', 'logs', 'controller_configs', 'downloads'],
    cstrike: ['cl_dlls', 'dlls', 'overviews', 'manual', 'save', 'logs', 'downloads'],
};
const EXT_FUERA = ['.dll', '.so', '.dylib', '.exe', '.icns', '.ico', '.dem', '.pdb', '.lib', '.vdf', '.fgd'];
// Sin estos no se puede jugar
export const NECESARIOS = ['valve/halflife.wad', 'cstrike/liblist.gam', 'cstrike/maps/de_dust2.bsp'];

// "Half-Life/cstrike/maps/de_dust2.bsp" -> "cstrike/maps/de_dust2.bsp" (o null si no sirve)
export function normalizarRuta(relativa) {
    const partes = String(relativa).replace(/\\/g, '/').split('/').filter(Boolean);
    const i = partes.findIndex((p) => p === 'valve' || p === 'cstrike');
    if (i < 0 || i === partes.length - 1) return null;
    const ruta = partes.slice(i);
    if (ruta.some((p) => p === '..' || p.startsWith('.'))) return null;
    return ruta.join('/');
}

export function incluir(ruta) {
    if (!ruta) return false;
    const [juego, carpeta] = ruta.split('/');
    if (!(juego in DIRS_FUERA)) return false;
    if (ruta.split('/').length > 2 && DIRS_FUERA[juego].includes(carpeta)) return false;
    const minus = ruta.toLowerCase();
    return !EXT_FUERA.some((ext) => minus.endsWith(ext));
}

// Elige qué archivos guardar de los que dio el selector de carpeta
export function seleccionar(archivos) {
    const elegidos = new Map();
    for (const f of archivos) {
        const ruta = normalizarRuta(f.webkitRelativePath || f.name);
        if (incluir(ruta) && !elegidos.has(ruta)) elegidos.set(ruta, f);
    }
    const faltan = NECESARIOS.filter((r) => !elegidos.has(r));
    return { elegidos, faltan };
}

// ------------------------------------------------------------- IndexedDB
const DB = 'cs16-archivos-propios';
const ST_ARCHIVOS = 'archivos';
const ST_META = 'meta';

function abrir() {
    return new Promise((ok, mal) => {
        const pedido = indexedDB.open(DB, 1);
        pedido.onupgradeneeded = () => {
            pedido.result.createObjectStore(ST_ARCHIVOS);
            pedido.result.createObjectStore(ST_META);
        };
        pedido.onsuccess = () => ok(pedido.result);
        pedido.onerror = () => mal(pedido.error);
    });
}

const esperar = (req) => new Promise((ok, mal) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
});
const terminar = (tx) => new Promise((ok, mal) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error || new Error('transacción cancelada'));
});

export async function estado() {
    try {
        const db = await abrir();
        const meta = await esperar(db.transaction(ST_META).objectStore(ST_META).get('meta'));
        db.close();
        return meta || null;
    } catch {
        return null;
    }
}

export async function borrar() {
    const db = await abrir();
    const tx = db.transaction([ST_ARCHIVOS, ST_META], 'readwrite');
    tx.objectStore(ST_ARCHIVOS).clear();
    tx.objectStore(ST_META).clear();
    await terminar(tx);
    db.close();
}

// Guarda la carpeta elegida. progreso(hechos, total)
export async function guardar(archivos, progreso = () => {}) {
    const { elegidos, faltan } = seleccionar(archivos);
    if (faltan.length) {
        const err = new Error(`En esa carpeta no están los archivos de Counter-Strike 1.6 (falta ${faltan[0]}). ` +
            'Elegí la carpeta «Half-Life» que tiene adentro «valve» y «cstrike».');
        err.faltan = faltan;
        throw err;
    }
    try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
    await borrar();
    const db = await abrir();
    const lista = [...elegidos];
    let bytes = 0;
    for (let i = 0; i < lista.length; i += 100) {
        const tanda = lista.slice(i, i + 100);
        // primero se lee la tanda (una transacción no puede esperar otra cosa sin cerrarse)
        const datos = await Promise.all(tanda.map(([, archivo]) => archivo.arrayBuffer()));
        const tx = db.transaction(ST_ARCHIVOS, 'readwrite');
        const st = tx.objectStore(ST_ARCHIVOS);
        tanda.forEach(([ruta], j) => {
            // se guarda el contenido (no el File: al recargar la página el File ya no sirve)
            st.put(new Blob([datos[j]]), ruta);
            bytes += datos[j].byteLength;
        });
        await terminar(tx);
        progreso(Math.min(i + 100, lista.length), lista.length);
    }
    const meta = { archivos: lista.length, bytes, fecha: Date.now() };
    const tx = db.transaction(ST_META, 'readwrite');
    tx.objectStore(ST_META).put(meta, 'meta');
    await terminar(tx);
    db.close();
    return meta;
}

// Pone los archivos guardados en el sistema de archivos del juego. sink(ruta, Uint8Array)
export async function volcar(sink, progreso = () => {}) {
    const db = await abrir();
    const claves = await esperar(db.transaction(ST_ARCHIVOS).objectStore(ST_ARCHIVOS).getAllKeys());
    const meta = (await esperar(db.transaction(ST_META).objectStore(ST_META).get('meta'))) || { bytes: 0 };
    let hechos = 0;
    let bytes = 0;
    for (let i = 0; i < claves.length; i += 50) {
        const tanda = claves.slice(i, i + 50);
        const st = db.transaction(ST_ARCHIVOS).objectStore(ST_ARCHIVOS);
        const blobs = await Promise.all(tanda.map((k) => esperar(st.get(k))));
        for (let j = 0; j < tanda.length; j++) {
            const datos = new Uint8Array(await blobs[j].arrayBuffer());
            sink(String(tanda[j]), datos);
            bytes += datos.length;
            hechos++;
        }
        progreso(bytes, meta.bytes || bytes, hechos, claves.length);
        await new Promise((r) => setTimeout(r, 0));
    }
    db.close();
    return { archivos: hechos, bytes };
}

// ----------------------------------------------- enganche con el cliente
// Lo llama el cliente del juego (parche) en lugar de bajar valve.zip.
// estadoServidor().assets.propios dice si este servidor usa archivos propios.
// Si la página llegó por otra dirección (por ejemplo Vercel), los paquetes grandes se bajan
// directo del servidor del juego (window.cs16Servidor, lo pone la web).
export function directo(ruta, servidor = globalThis.cs16Servidor, origen = globalThis.location?.origin) {
    return servidor && servidor !== origen ? servidor + ruta : ruta;
}

// Antes de bajar (o de usar lo ya guardado) se prueba la contraseña: así un error se
// avisa claro en la pantalla de entrada y no adentro del juego.
async function revisarClave(url) {
    let r;
    try {
        r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    } catch {
        return;   // sin red: que siga y falle donde corresponda
    }
    if (r.status === 403) throw new Error('Contraseña incorrecta. Revisala y probá de nuevo.');
    if (r.status === 429) throw new Error('Demasiados intentos con la contraseña. Esperá unos minutos y probá de nuevo.');
}

// prepararArchivos(): devuelve una función (ruta, bytes) -> bytes que retoca archivos al
// cargarlos (los grafitis de SLA, ver grafitis.js); si falla, se carga todo tal cual.
export function instalarEnganche(estadoServidor, clave = () => '', prepararArchivos = null) {
    window.cs16CargarArchivos = async (url, version, tamano, sinkOriginal, progreso, cargarZip) => {
        url = directo(url);
        let retocar = null;
        try { retocar = prepararArchivos ? await prepararArchivos() : null; } catch (e) { console.warn('[archivos]', e); }
        const sink = retocar ? (ruta, datos) => sinkOriginal(ruta, retocar(ruta, datos)) : sinkOriginal;
        const assets = estadoServidor()?.assets;
        if (!assets?.propios) {
            const c = clave();
            const conClave = c ? `${url}?clave=${encodeURIComponent(c)}` : url;
            await revisarClave(conClave);
            return cargarZip(conClave, version, tamano, sink, progreso);
        }
        if (!(await estado())) throw new Error('Primero elegí tus archivos de Counter-Strike 1.6 (botón «Elegir carpeta»).');
        await volcar(sink, (b, total) => progreso('cache', b, total));
        // después lo propio de la comunidad, que pisa lo que haga falta
        return cargarZip(directo('/game/mod.zip'), assets.version, assets.size, sink, progreso);
    };
}

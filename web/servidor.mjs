// Servidor web del juego: página (cliente Xash3D en WebAssembly), archivos del juego,
// estado de las salas y señalización WebRTC hacia los servidores de CS.
//
// Basado en server/index.mjs y server/http.mjs de CSweb
// (https://github.com/santiagoPostacchini/CSweb, MIT).
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RtcBridge } from './rtc.mjs';
import { consultarInfo } from './consulta.mjs';
import { cargarSalas } from './salas.mjs';
import { Metricas, paginaClave, paginaEstadisticas, resumir } from './metricas.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = (k, d) => (process.env[k] ?? '').trim() || d;

const cfg = {
    httpPort: Number(env('PUERTO_WEB', '27016')),
    webrtcPort: Number(env('PUERTO_WEBRTC', '27018')),
    publicIp: env('IP_PUBLICA', ''),
    // Dirección pública del juego (https://...). Si la página llega por otra (Vercel), el
    // navegador se conecta y baja los paquetes directo de acá.
    urlJuego: env('URL_JUEGO', ''),
    hostname: env('NOMBRE_SERVIDOR', 'CS 1.6'),
    map: env('MAPA', 'de_dust2'),
    maxPlayers: Number(env('MAX_JUGADORES', '12')),
    password: env('CONTRASENA', ''),
    data: env('DATOS', '/data/build'),
    publicDir: env('PUBLICO', path.join(HERE, 'public')),
    // Funciones propias de la página (salas, equipo, archivos propios, manos). Se leen en
    // cada pedido: con la carpeta montada, los cambios se ven al recargar.
    clienteDir: env('CLIENTE', path.join(HERE, 'cliente')),
    // Capa de marca (logo, colores, textos). Opcional; también se lee en cada pedido.
    marcaDir: env('MARCA', '/data/marca/web'),
    salasArchivo: env('SALAS', '/config/salas.conf'),
    // 'servidor': la página manda los archivos del juego (solo para uso privado).
    // 'propios':  cada jugador usa sus archivos de CS 1.6 (servidores públicos).
    archivos: env('ARCHIVOS', 'servidor') === 'propios' ? 'propios' : 'servidor',
    maxPorIp: Number(env('MAX_POR_IP', '4')),
    // Detrás de Caddy (modo online) la IP real del jugador viene en X-Forwarded-For
    confiarProxy: env('CONFIAR_PROXY', '0') === '1',
    // métricas: dónde se guardan, la clave de /estadisticas y la zona horaria de los días
    metricasDir: env('METRICAS', path.join(HERE, 'metricas')),
    claveEstadisticas: env('CLAVE_ESTADISTICAS', ''),
    zona: env('ZONA_HORARIA', 'America/Argentina/Buenos_Aires'),
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.zip': 'application/zip',
    '.pk3': 'application/octet-stream',
    '.txt': 'text/plain; charset=utf-8',
    '.woff2': 'font/woff2',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
};
const SECURITY = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
};

const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

// ------------------------------------------------------------------ salas
const porDefecto = { nombre: cfg.hostname, mapa: cfg.map, maxJugadores: cfg.maxPlayers };
let salas = cargarSalas(cfg.salasArchivo, porDefecto);
let salasMtime = 0;
const estado = new Map(); // id -> { online, map, players, bots }

function recargarSalas() {
    let mtime = 0;
    try {
        mtime = fs.statSync(cfg.salasArchivo).mtimeMs;
    } catch { /* sin archivo */ }
    if (mtime !== salasMtime) {
        salasMtime = mtime;
        salas = cargarSalas(cfg.salasArchivo, porDefecto);
        log(`[web] salas: ${salas.map((s) => `${s.id} (${s.nombre}, puerto ${s.puerto})`).join(', ')}`);
    }
}

function buscarSala(id) {
    return salas.find((s) => s.id === id) || salas[0];
}

async function consultarSalas() {
    recargarSalas();
    await Promise.all(salas.map(async (s) => {
        const info = await consultarInfo(s.puerto);
        const antes = estado.get(s.id)?.online;
        if (info) {
            estado.set(s.id, { online: true, map: info.map || s.mapa, players: info.players, bots: info.bots });
            if (!antes) log(`[juego] sala ${s.id} lista, mapa ${info.map}`);
        } else {
            estado.set(s.id, { online: false, map: s.mapa, players: 0, bots: 0 });
            if (antes) log(`[juego] la sala ${s.id} no responde`);
        }
    }));
}
setInterval(consultarSalas, 5000).unref();
consultarSalas();

// ---------------------------------------------------------------- archivos
function leerJson(archivo, cache) {
    try {
        const st = fs.statSync(archivo);
        if (st.mtimeMs !== cache.mtime) {
            cache.mtime = st.mtimeMs;
            cache.value = JSON.parse(fs.readFileSync(archivo, 'utf8'));
        }
    } catch {
        cache.mtime = 0;
        cache.value = null;
    }
    return cache.value;
}
const cacheAssets = { mtime: 0, value: null };
const cacheMod = { mtime: 0, value: null };
const leerAssets = () => leerJson(path.join(cfg.data, 'assets.json'), cacheAssets);
const leerMod = () => leerJson(path.join(cfg.data, 'mod.json'), cacheMod);

// Lo que el navegador tiene que cargar. En modo 'propios' solo el paquete de la
// comunidad (logo, personajes, mapas nuevos): el resto lo pone cada jugador.
function assetsParaCliente() {
    if (cfg.archivos === 'propios') {
        const mod = leerMod();
        return mod ? { ...mod, propios: true } : null;
    }
    return leerAssets();
}

// Contraseña de la descarga: después de 10 intentos fallidos en 10 minutos, esa IP espera.
const FALLOS_MAX = 10;
const FALLOS_VENTANA = 10 * 60 * 1000;
const fallos = new Map();   // ip -> { n, desde }
function demasiadosFallos(ip) {
    const f = fallos.get(ip);
    if (!f) return false;
    if (Date.now() - f.desde > FALLOS_VENTANA) {
        fallos.delete(ip);
        return false;
    }
    return f.n >= FALLOS_MAX;
}
function anotarFallo(ip) {
    const f = fallos.get(ip);
    if (!f || Date.now() - f.desde > FALLOS_VENTANA) {
        if (fallos.size > 10000) fallos.clear();
        fallos.set(ip, { n: 1, desde: Date.now() });
    } else f.n++;
}

function claveOk(dada) {
    if (!cfg.password) return true;
    const a = Buffer.from(String(dada || ''));
    const b = Buffer.from(cfg.password);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --------------------------------------------------------------------- http
function sendFile(req, res, file, cacheControl, etag) {
    let stat;
    try {
        stat = fs.statSync(file);
        if (!stat.isFile()) throw new Error('no es archivo');
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY });
        res.end('No encontrado');
        return;
    }
    const headers = {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': cacheControl,
        'Last-Modified': stat.mtime.toUTCString(),
        ...(path.extname(file) === '.zip' ? CORS : {}),
        ...SECURITY,
    };
    if (etag) {
        headers.ETag = `"${etag}"`;
        if (req.headers['if-none-match'] === headers.ETag) {
            delete headers['Content-Length'];
            res.writeHead(304, headers);
            res.end();
            return;
        }
    } else if (req.headers['if-modified-since'] === headers['Last-Modified']) {
        delete headers['Content-Length'];
        res.writeHead(304, headers);
        res.end();
        return;
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
        res.end();
        return;
    }
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
}

const escaparHtml = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Solo una dirección https válida (la del modo online); si no, la página usa la propia.
function origenPublico(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' ? u.origin : '';
    } catch {
        return '';
    }
}

// El estado y los paquetes se pueden pedir desde otra dirección (la página en Vercel):
// son públicos y valve.zip igual pide la contraseña.
const CORS = { 'Access-Control-Allow-Origin': '*' };

function sendJson(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...CORS, ...SECURITY });
    res.end(JSON.stringify(data));
}

function sendText(res, status, texto) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...CORS, ...SECURITY });
    res.end(texto);
}

const PUBLIC = path.resolve(cfg.publicDir);
const CLIENTE = path.resolve(cfg.clienteDir);
const MARCA = path.resolve(cfg.marcaDir);

function mtimeDe(file) {
    try {
        return Math.floor(fs.statSync(file).mtimeMs).toString(36);
    } catch {
        return null;
    }
}

// Sirve un archivo de una carpeta sin dejar salir de ella
function servirDe(base, rel, req, res, cacheControl = 'no-cache') {
    const archivo = path.resolve(base, rel);
    if (!archivo.startsWith(base + path.sep)) {
        res.writeHead(403, SECURITY);
        res.end();
        return;
    }
    sendFile(req, res, archivo, cacheControl);
}

// index.html + funciones propias (cliente/) + capa de marca, con la fecha de cada
// archivo en la URL para que el navegador no use uno viejo.
function sendIndex(req, res) {
    let html;
    try {
        html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    } catch {
        res.writeHead(404, SECURITY);
        res.end('No encontrado');
        return;
    }
    const cabeza = [];
    const cuerpo = [];
    const v = (archivo) => mtimeDe(archivo);
    const entradaCss = v(path.join(CLIENTE, 'entrada.css'));
    const entradaJs = v(path.join(CLIENTE, 'entrada.js'));
    const marcaCss = v(path.join(MARCA, 'marca.css'));
    const marcaJs = v(path.join(MARCA, 'marca.js'));
    const icono = v(path.join(MARCA, 'favicon.svg'));
    if (icono) html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="/marca/favicon.svg?v=${icono}">`);
    if (entradaCss) cabeza.push(`<link rel="stylesheet" href="/cliente/entrada.css?v=${entradaCss}">`);
    if (marcaCss) cabeza.push(`<link rel="stylesheet" href="/marca/marca.css?v=${marcaCss}">`);
    if (marcaJs) cuerpo.push(`<script type="module" src="/marca/marca.js?v=${marcaJs}"></script>`);
    if (entradaJs) cuerpo.push(`<script type="module" src="/cliente/entrada.js?v=${entradaJs}"></script>`);
    const servidor = origenPublico(cfg.urlJuego);
    if (servidor) cabeza.unshift(`<script>window.cs16Servidor=${JSON.stringify(servidor)}</script>`);
    // Título y vista previa al compartir el link (WhatsApp, redes): nombre del servidor e
    // imagen de la marca (marca/web/og.png), si existe.
    const titulo = escaparHtml(cfg.hostname || 'Counter-Strike 1.6');
    const descripcion = 'Counter-Strike 1.6 en el navegador, sin instalar nada.';
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${titulo}</title>`);
    cabeza.unshift(
        `<meta name="description" content="${descripcion}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:title" content="${titulo}">`,
        `<meta property="og:description" content="${descripcion}">`,
    );
    const og = v(path.join(MARCA, 'og.png'));
    if (og && servidor) {
        cabeza.unshift(`<meta property="og:image" content="${servidor}/marca/og.png?v=${og}">`,
            '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
            '<meta name="twitter:card" content="summary_large_image">');
    }
    html = html.replace('</head>', `${cabeza.join('\n')}\n</head>`).replace('</body>', `${cuerpo.join('\n')}\n</body>`);
    const body = Buffer.from(html);
    res.writeHead(200, {
        'Content-Type': MIME['.html'],
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        ...SECURITY,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
}

function datosSala(s) {
    const e = estado.get(s.id) || { online: false, map: s.mapa, players: 0, bots: 0 };
    return {
        id: s.id,
        nombre: s.nombre,
        mapa: e.map,
        jugadores: Math.max(e.players - e.bots, 0),
        bots: e.bots,
        max: s.maxJugadores,
        web: bridge.contarSala(s.id),
        online: e.online,
    };
}

function handler(req, res) {
    let url;
    try {
        url = new URL(req.url, 'http://localhost');
    } catch {
        res.writeHead(400);
        res.end();
        return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, SECURITY);
        res.end();
        return;
    }
    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch {
        res.writeHead(400, SECURITY);
        res.end();
        return;
    }

    if (pathname === '/api/status') {
        // forma de siempre (la usa el cliente), para la sala elegida con ?sala=
        const s = buscarSala(url.searchParams.get('sala'));
        const d = datosSala(s);
        return sendJson(res, {
            hostname: s.nombre,
            map: d.mapa,
            maxPlayers: s.maxJugadores,
            webPlayers: d.web,
            needsPassword: Boolean(cfg.password),
            serverOnline: d.online,
            assets: assetsParaCliente(),
            sala: s.id,
            salas: salas.length,
        });
    }

    if (pathname === '/api/salas') {
        return sendJson(res, {
            nombre: cfg.hostname,
            archivos: cfg.archivos,
            needsPassword: Boolean(cfg.password),
            salas: salas.map(datosSala),
        });
    }

    if (pathname === '/game/valve.zip') {
        if (cfg.archivos === 'propios') {
            return sendText(res, 404, 'Este servidor es público: usá tus propios archivos del juego.');
        }
        const ip = ipDe(req);
        if (demasiadosFallos(ip)) return sendText(res, 429, 'Demasiados intentos con la contraseña: probá de nuevo en unos minutos.');
        if (!claveOk(url.searchParams.get('clave'))) {
            anotarFallo(ip);
            return sendText(res, 403, 'Falta la contraseña del servidor.');
        }
        // El navegador lo guarda en IndexedDB según la versión: no hace falta caché HTTP.
        return sendFile(req, res, path.join(cfg.data, 'valve.zip'), 'no-store', leerAssets()?.version);
    }

    if (pathname === '/game/mod.zip') {
        return sendFile(req, res, path.join(cfg.data, 'mod.zip'), 'no-store', leerMod()?.version);
    }

    if (pathname === '/api/visita') {
        metricas.visita(url.searchParams.get('id'));
        res.writeHead(204, { 'Cache-Control': 'no-store', ...SECURITY });
        res.end();
        return;
    }

    if (pathname === '/estadisticas') return sendEstadisticas(req, res, url);

    if (pathname === '/' || pathname === '/index.html') return sendIndex(req, res);
    if (pathname.startsWith('/cliente/')) return servirDe(CLIENTE, pathname.slice('/cliente/'.length), req, res);
    if (pathname.startsWith('/marca/')) return servirDe(MARCA, pathname.slice('/marca/'.length), req, res);

    const rel = pathname.replace(/^\/+/, '');
    // Los archivos de assets/ llevan hash en el nombre: se pueden guardar para siempre.
    const immutable = rel.startsWith('assets/');
    return servirDe(PUBLIC, rel, req, res, immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
}

// -------------------------------------------------------------- métricas
const metricas = new Metricas(cfg.metricasDir, { log });
metricas.anotar({ tipo: 'inicio' });

function claveEstadisticasOk(dada) {
    const a = Buffer.from(String(dada || ''));
    const b = Buffer.from(cfg.claveEstadisticas);
    return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendHtml(res, status, html) {
    const body = Buffer.from(html);
    res.writeHead(status, {
        'Content-Type': MIME['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex', ...SECURITY,
    });
    res.end(body);
}

function sendEstadisticas(req, res, url) {
    if (!cfg.claveEstadisticas) return sendText(res, 404, 'Las estadísticas no están activadas en este servidor.');
    const ip = ipDe(req);
    if (demasiadosFallos(ip)) return sendText(res, 429, 'Demasiados intentos: probá de nuevo en unos minutos.');
    const clave = url.searchParams.get('clave');
    if (!claveEstadisticasOk(clave)) {
        if (clave) anotarFallo(ip);
        return sendHtml(res, clave ? 403 : 200, paginaClave({ error: Boolean(clave) }));
    }
    const ahora = Date.now();
    const resumen = resumir(metricas.leer(ahora - 15 * 24 * 60 * 60 * 1000), { zona: cfg.zona, ahora });
    const enLinea = [...bridge.peers].filter((p) => p.open).map((p) => ({ sala: p.sala, nombre: p.nombre, desde: p.desde }));
    return sendHtml(res, 200, paginaEstadisticas({ resumen, enLinea, salas, nombre: cfg.hostname, zona: cfg.zona, ahora }));
}

// --------------------------------------------------------------- WebRTC
cfg.maxPeers = salas.reduce((n, s) => n + s.maxJugadores + 2, 0) + 4;
const bridge = new RtcBridge(cfg);
bridge.on('join', (p) => log(`[web] jugador conectado a la sala ${p.sala} (${bridge.count} en línea)`));
bridge.on('jugando', (p) => metricas.entra(p));
bridge.on('leave', (p, why) => {
    log(`[web] jugador desconectado de la sala ${p.sala}: ${why} (${bridge.count} en línea)`);
    if (p.nombre) metricas.sale(p);
});

function ipDe(req) {
    const directa = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (!cfg.confiarProxy) return directa;
    const reenviada = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return reenviada || directa;
}

const httpServer = http.createServer(handler);
httpServer.headersTimeout = 20000;
httpServer.requestTimeout = 0; // la descarga de valve.zip puede tardar
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
httpServer.on('upgrade', (req, socket, head) => {
    let url = null;
    try {
        url = new URL(req.url, 'http://localhost');
    } catch { /* url rota */ }
    if (!url || url.pathname !== '/signal') {
        socket.destroy();
        return;
    }
    const sala = buscarSala(url.searchParams.get('sala'));
    wss.handleUpgrade(req, socket, head, (ws) => {
        cfg.maxPeers = salas.reduce((n, s) => n + s.maxJugadores + 2, 0) + 4;
        bridge.handle(ws, ipDe(req), sala);
    });
});

httpServer.listen(cfg.httpPort, '0.0.0.0', () => {
    log(`[web] página del juego en el puerto ${cfg.httpPort}; WebRTC en UDP ${cfg.webrtcPort}` +
        (cfg.publicIp ? ` anunciando ${cfg.publicIp}` : '') + `; archivos del juego: ${cfg.archivos}`);
    if (!assetsParaCliente()) log(`[web] aviso: todavía no hay ${cfg.archivos === 'propios' ? 'mod.zip' : 'valve.zip'} en ${cfg.data}`);
});

let shuttingDown = false;
function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    bridge.closeAll();
    httpServer.close();
    setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

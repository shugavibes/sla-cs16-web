// Grafitis de SLA en los mapas.
//
// Cuando el juego carga sus archivos (los del servidor o los propios de cada jugador),
// esta página pinta los grafitis de marca/web/grafitis/ encima de algunas texturas:
//   - de_dust y de_dust2: el logo de SLA en aerosol en una de las dos piedras de pared que
//     el juego reparte al azar (sale en más o menos la mitad de las paredes), el logo en
//     esténcil en los cajones grandes y militares, y el timbre pegado debajo de las
//     ventanas, en las puertas grandes y en los cajones chicos.
//   - Todos los mapas: los aerosoles que tiran los bots (logos.cfg de YaPB) pasan a ser el
//     logo de SLA (a color, verde, negro o blanco) y el timbre.
// Solo se cambian texturas que vienen en archivos .wad aparte del mapa: el mapa queda igual
// y el servidor no nota ninguna diferencia. Los archivos guardados no se tocan: se pinta
// cada vez al cargar, en la memoria del juego. Si algo no coincide (otra versión del .wad),
// esa textura queda como estaba.

const CARPETA = '/marca/grafitis/';
const VERDE = [19, 196, 116];
const NEGRO = [14, 16, 14];
const BLANCO = [236, 236, 230];
const DECALS = ['cstrike/decals.wad', 'valve/decals.wad'];

export const PARCHES = [
    // Ojo: el juego muestra las texturas espejadas en más o menos la mitad de las paredes
    // (así funciona CS 1.6): ahí el logo se lee al revés. El timbre es simétrico.
    { archivos: ['cstrike/cs_dust.wad'], textura: '-1CSSANDWALL', tipo: 'pared', imagen: 'pared-logo.png' },
    { archivos: ['cstrike/cs_dust.wad'], textura: 'SANDWLLWNDW', tipo: 'pared', imagen: 'ventana-timbre.png' },
    { archivos: ['cstrike/cs_dust.wad'], textura: 'SANDWLLDOOR', tipo: 'pared', imagen: 'puerta-timbre.png' },
    { archivos: ['cstrike/cs_dust.wad'], textura: 'SANDCRTLRGSD', tipo: 'pared', imagen: 'caja-logo.png' },
    { archivos: ['cstrike/cs_dust.wad'], textura: 'SANDCRTSMSD', tipo: 'pared', imagen: 'caja-chica-timbre.png' },
    { archivos: ['cstrike/cs_dust.wad'], textura: 'MLTRYCRTESD', tipo: 'pared', imagen: 'caja-militar-logo.png' },
    // aerosoles de los bots: a todo color (logo y timbre) o de un color con bordes suaves
    { archivos: DECALS, textura: '{GRAF003', tipo: 'calco-color', imagen: 'calco-logo-color.png' },
    { archivos: DECALS, textura: '{GRAF004', tipo: 'calco', imagen: 'calco-logo.png', color: NEGRO },
    { archivos: DECALS, textura: '{GRAF005', tipo: 'calco-color', imagen: 'calco-timbre-color.png' },
    { archivos: DECALS, textura: '{BIOHAZ', tipo: 'calco-color', imagen: 'calco-logo-color.png' },
    { archivos: DECALS, textura: '{LAMBDA06', tipo: 'calco', imagen: 'calco-logo.png', color: BLANCO },
    { archivos: DECALS, textura: '{TARGET', tipo: 'calco-color', imagen: 'calco-timbre-color.png' },
    { archivos: DECALS, textura: '{HAND1', tipo: 'calco', imagen: 'calco-logo.png', color: VERDE },
    { archivos: DECALS, textura: '{SPIT2', tipo: 'calco-color', imagen: 'calco-logo-color.png' },
    { archivos: DECALS, textura: '{BLOODHAND6', tipo: 'calco', imagen: 'calco-sla.png', color: VERDE },
    { archivos: DECALS, textura: '{FOOT_L', tipo: 'calco', imagen: 'calco-logo.png', color: NEGRO },
    { archivos: DECALS, textura: '{FOOT_R', tipo: 'calco-color', imagen: 'calco-timbre-color.png' },
];

// ------------------------------------------------------------------ .wad
const TIPO_MIPTEX = 0x43;

export function leerWad(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const firma = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (firma !== 'WAD3') throw new Error('no es un WAD3');
    const cantidad = v.getInt32(4, true);
    const tabla = v.getInt32(8, true);
    if (cantidad < 0 || tabla < 12 || tabla + cantidad * 32 > bytes.length) throw new Error('índice roto');
    const entradas = new Map();
    for (let i = 0; i < cantidad; i++) {
        const o = tabla + i * 32;
        let nombre = '';
        for (let k = 0; k < 16 && bytes[o + 16 + k]; k++) nombre += String.fromCharCode(bytes[o + 16 + k]);
        entradas.set(nombre.toUpperCase(), {
            pos: o, filepos: v.getInt32(o, true), disksize: v.getInt32(o + 4, true),
            size: v.getInt32(o + 8, true), tipo: bytes[o + 12], compresion: bytes[o + 13],
        });
    }
    return entradas;
}

export function leerMiptex(bytes, entrada) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const p = entrada.filepos;
    const ancho = v.getInt32(p + 16, true);
    const alto = v.getInt32(p + 20, true);
    const ofs0 = v.getInt32(p + 24, true);
    const px = ancho * alto;
    const paleta = p + ofs0 + ((px * 85) >> 6);
    if (ancho <= 0 || alto <= 0 || ancho > 1024 || alto > 1024 || paleta + 2 + 768 > bytes.length) throw new Error('textura rara');
    if (v.getUint16(paleta, true) !== 256) throw new Error('paleta rara');
    return {
        nombre: bytes.slice(p, p + 16),
        ancho, alto,
        indices: bytes.subarray(p + ofs0, p + ofs0 + px),
        paleta: bytes.subarray(paleta + 2, paleta + 2 + 768),
    };
}

// Arma una textura del .wad: encabezado, 4 tamaños (mipmaps) y la paleta de 256 colores
export function armarMiptex(nombre, ancho, alto, mips, paleta) {
    const tam = mips.reduce((s, m) => s + m.length, 0);
    const out = new Uint8Array(40 + tam + 2 + 768 + 2);
    const v = new DataView(out.buffer);
    out.set(nombre.subarray(0, 16), 0);
    v.setInt32(16, ancho, true);
    v.setInt32(20, alto, true);
    let o = 40;
    mips.forEach((m, i) => { v.setInt32(24 + i * 4, o, true); out.set(m, o); o += m.length; });
    v.setUint16(o, 256, true);
    out.set(paleta, o + 2);
    return out;
}

// Devuelve un .wad nuevo con esas texturas cambiadas (los datos nuevos van al final)
export function reemplazar(bytes, cambios) {
    let extra = 0;
    const lugares = cambios.map(({ datos }) => {
        const desde = bytes.length + extra + ((4 - ((bytes.length + extra) % 4)) % 4);
        extra = desde - bytes.length + datos.length;
        return desde;
    });
    const out = new Uint8Array(bytes.length + extra);
    out.set(bytes);
    const v = new DataView(out.buffer);
    cambios.forEach(({ entrada, datos }, i) => {
        out.set(datos, lugares[i]);
        v.setInt32(entrada.pos, lugares[i], true);
        v.setInt32(entrada.pos + 4, datos.length, true);
        v.setInt32(entrada.pos + 8, datos.length, true);
        out[entrada.pos + 12] = TIPO_MIPTEX;
        out[entrada.pos + 13] = 0;
    });
    return out;
}

// ---------------------------------------------------------------- colores
// Reduce una imagen a 256 colores (corte por la mediana, sobre un histograma de 32 niveles
// por canal: rápido aunque la textura sea grande; los colores salen del promedio exacto)
export function cuantizar(rgb, maximo = 256) {
    const n = rgb.length / 3;
    const cuenta = new Uint32Array(32768);
    const suma = new Float64Array(32768 * 3);
    for (let i = 0; i < n; i++) {
        const r = rgb[i * 3];
        const g = rgb[i * 3 + 1];
        const b = rgb[i * 3 + 2];
        const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        cuenta[k]++;
        suma[k * 3] += r;
        suma[k * 3 + 1] += g;
        suma[k * 3 + 2] += b;
    }
    const usados = [];
    for (let k = 0; k < 32768; k++) if (cuenta[k]) usados.push(k);
    const nivel = (k, c) => (c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31);
    const medir = (caja) => {
        let total = 0;
        let mejor = -1;
        let canal = 0;
        for (const k of caja) total += cuenta[k];
        for (let c = 0; c < 3; c++) {
            let min = 31;
            let max = 0;
            for (const k of caja) { const x = nivel(k, c); if (x < min) min = x; if (x > max) max = x; }
            if (max - min > mejor) { mejor = max - min; canal = c; }
        }
        return { puntaje: mejor * Math.sqrt(total), canal, total };
    };
    let cajas = [{ bins: Int32Array.from(usados), ...medir(usados) }];
    while (cajas.length < maximo) {
        let elegida = -1;
        for (let i = 0; i < cajas.length; i++) {
            if (cajas[i].bins.length > 1 && (elegida < 0 || cajas[i].puntaje > cajas[elegida].puntaje)) elegida = i;
        }
        if (elegida < 0) break;
        const { bins, canal, total } = cajas[elegida];
        const orden = bins.slice().sort((a, b) => nivel(a, canal) - nivel(b, canal));
        let acum = 0;
        let corte = 1;
        for (; corte < orden.length - 1; corte++) {
            acum += cuenta[orden[corte - 1]];
            if (acum * 2 >= total) break;
        }
        const a = orden.subarray(0, corte);
        const b = orden.subarray(corte);
        cajas.splice(elegida, 1, { bins: a, ...medir(a) }, { bins: b, ...medir(b) });
    }
    const paleta = new Uint8Array(768);
    cajas.forEach((caja, j) => {
        let t = 0;
        const s = [0, 0, 0];
        for (const k of caja.bins) { t += cuenta[k]; for (let c = 0; c < 3; c++) s[c] += suma[k * 3 + c]; }
        for (let c = 0; c < 3; c++) paleta[j * 3 + c] = Math.round(s[c] / Math.max(1, t));
    });
    return paleta;
}

export function indexar(rgb, paleta, colores = 256) {
    const n = rgb.length / 3;
    const out = new Uint8Array(n);
    const memo = new Map();
    for (let i = 0; i < n; i++) {
        const r = rgb[i * 3];
        const g = rgb[i * 3 + 1];
        const b = rgb[i * 3 + 2];
        const clave = (r << 16) | (g << 8) | b;
        let k = memo.get(clave);
        if (k === undefined) {
            let mejor = Infinity;
            for (let j = 0; j < colores; j++) {
                const dr = r - paleta[j * 3];
                const dg = g - paleta[j * 3 + 1];
                const db = b - paleta[j * 3 + 2];
                const d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
                if (d < mejor) { mejor = d; k = j; }
            }
            memo.set(clave, k);
        }
        out[i] = k;
    }
    return out;
}

// Mitad de tamaño promediando de a 2 × 2 (canales: 3 para color, 1 para transparencia)
export function reducir(datos, ancho, alto, canales) {
    const a2 = ancho >> 1;
    const h2 = alto >> 1;
    const out = new Uint8Array(a2 * h2 * canales);
    for (let y = 0; y < h2; y++) {
        for (let x = 0; x < a2; x++) {
            for (let c = 0; c < canales; c++) {
                const p = (yy, xx) => datos[(yy * ancho + xx) * canales + c];
                out[(y * a2 + x) * canales + c] = (p(2 * y, 2 * x) + p(2 * y, 2 * x + 1) + p(2 * y + 1, 2 * x) + p(2 * y + 1, 2 * x + 1) + 2) >> 2;
            }
        }
    }
    return out;
}

// Pintura encima de la piedra: deja ver un poco la textura de abajo
export function pintarPared(tex, capa) {
    const n = tex.ancho * tex.alto;
    const rgb = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
        const k = tex.indices[i] * 3;
        const br = tex.paleta[k];
        const bg = tex.paleta[k + 1];
        const bb = tex.paleta[k + 2];
        const a = capa[i * 4 + 3] / 255;
        const luz = 0.62 + 0.55 * ((br * 0.299 + bg * 0.587 + bb * 0.114) / 255);
        rgb[i * 3] = Math.round(br * (1 - a) + Math.min(255, capa[i * 4] * luz) * a);
        rgb[i * 3 + 1] = Math.round(bg * (1 - a) + Math.min(255, capa[i * 4 + 1] * luz) * a);
        rgb[i * 3 + 2] = Math.round(bb * (1 - a) + Math.min(255, capa[i * 4 + 2] * luz) * a);
    }
    return rgb;
}

export function texturaPared(tex, capa) {
    let rgb = pintarPared(tex, capa);
    const paleta = cuantizar(rgb);
    const mips = [];
    let ancho = tex.ancho;
    let alto = tex.alto;
    for (let m = 0; m < 4; m++) {
        mips.push(indexar(rgb, paleta));
        if (m < 3) { rgb = reducir(rgb, ancho, alto, 3); ancho >>= 1; alto >>= 1; }
    }
    return armarMiptex(tex.nombre, tex.ancho, tex.alto, mips, paleta);
}

// Calcomanía de un color: el índice de cada píxel es su transparencia y el último color
// de la paleta es el de la pintura (así dibuja el juego los aerosoles)
export function texturaCalco(nombre, ancho, alto, alfa, color) {
    const paleta = new Uint8Array(768);
    for (let i = 0; i < 255; i++) paleta.set([i, i, i], i * 3);
    paleta.set(color, 765);
    const mips = [];
    let a = Uint8Array.from(alfa, (x) => Math.min(254, Math.round((x * 254) / 255)));
    let w = ancho;
    let h = alto;
    for (let m = 0; m < 4; m++) {
        mips.push(a);
        if (m < 3) { a = reducir(a, w, h, 1); w >>= 1; h >>= 1; }
    }
    return armarMiptex(nombre, ancho, alto, mips, paleta);
}

// Calcomanía a todo color (el timbre, el logo con su borde): el juego la dibuja opaca o
// transparente; el índice 255 es el transparente y su color tiene que ser azul puro
export function texturaCalcoColor(nombre, ancho, alto, rgba) {
    const opacos = [];
    for (let i = 0; i < ancho * alto; i++) {
        if (rgba[i * 4 + 3] >= 128) opacos.push(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    }
    const paleta = cuantizar(Uint8Array.from(opacos.length ? opacos : [0, 0, 0]), 255);
    paleta.set([0, 0, 255], 765);
    const mips = [];
    let datos = Uint8Array.from(rgba);
    let w = ancho;
    let h = alto;
    for (let m = 0; m < 4; m++) {
        const rgb = new Uint8Array(w * h * 3);
        for (let i = 0; i < w * h; i++) rgb.set(datos.subarray(i * 4, i * 4 + 3), i * 3);
        const idx = indexar(rgb, paleta, 255);
        for (let i = 0; i < w * h; i++) if (datos[i * 4 + 3] < 128) idx[i] = 255;
        mips.push(idx);
        if (m < 3) { datos = reducirConTransparencia(datos, w, h); w >>= 1; h >>= 1; }
    }
    return armarMiptex(nombre, ancho, alto, mips, paleta);
}

// Mitad de tamaño para una imagen con transparencia de sí o no: cada píxel nuevo es opaco
// si al menos dos de los cuatro lo eran (con el promedio de esos)
export function reducirConTransparencia(rgba, ancho, alto) {
    const a2 = ancho >> 1;
    const h2 = alto >> 1;
    const out = new Uint8Array(a2 * h2 * 4);
    for (let y = 0; y < h2; y++) {
        for (let x = 0; x < a2; x++) {
            let n = 0;
            const s = [0, 0, 0];
            for (const [dy, dx] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
                const i = ((2 * y + dy) * ancho + 2 * x + dx) * 4;
                if (rgba[i + 3] >= 128) { n++; s[0] += rgba[i]; s[1] += rgba[i + 1]; s[2] += rgba[i + 2]; }
            }
            const o = (y * a2 + x) * 4;
            if (n >= 2) out.set([Math.round(s[0] / n), Math.round(s[1] / n), Math.round(s[2] / n), 255], o);
        }
    }
    return out;
}

// -------------------------------------------------------------- imágenes
async function cargarImagen(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    const bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const lienzo = typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(bmp.width, bmp.height)
        : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    return { ancho: bmp.width, alto: bmp.height, rgba: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
}

// Arma la función que pinta los archivos al cargarlos: parchear(ruta, bytes) -> bytes
export function armarParcheador(imagenes, parches = PARCHES, aviso = console.warn) {
    const porArchivo = new Map();
    for (const p of parches) {
        if (!imagenes.has(p.imagen)) continue;
        for (const a of p.archivos) {
            if (!porArchivo.has(a)) porArchivo.set(a, []);
            porArchivo.get(a).push(p);
        }
    }
    return (ruta, bytes) => {
        const lista = porArchivo.get(String(ruta).toLowerCase());
        if (!lista) return bytes;
        try {
            const entradas = leerWad(bytes);
            const cambios = [];
            for (const p of lista) {
                const entrada = entradas.get(p.textura);
                if (!entrada || entrada.tipo !== TIPO_MIPTEX || entrada.compresion) continue;
                const img = imagenes.get(p.imagen);
                try {
                    const tex = leerMiptex(bytes, entrada);
                    if (p.tipo === 'pared') {
                        if (img.ancho !== tex.ancho || img.alto !== tex.alto) continue;   // otra versión
                        cambios.push({ entrada, datos: texturaPared(tex, img.rgba) });
                    } else if (p.tipo === 'calco-color') {
                        cambios.push({ entrada, datos: texturaCalcoColor(tex.nombre, img.ancho, img.alto, img.rgba) });
                    } else {
                        const alfa = new Uint8Array(img.ancho * img.alto);
                        for (let i = 0; i < alfa.length; i++) alfa[i] = img.rgba[i * 4];
                        cambios.push({ entrada, datos: texturaCalco(tex.nombre, img.ancho, img.alto, alfa, p.color) });
                    }
                } catch (e) {
                    aviso(`[grafitis] ${ruta} ${p.textura}:`, e.message);
                }
            }
            return cambios.length ? reemplazar(bytes, cambios) : bytes;
        } catch (e) {
            aviso(`[grafitis] ${ruta}:`, e.message);
            return bytes;
        }
    };
}

// Baja las imágenes una vez; si no hay, el juego carga igual sin grafitis
export async function prepararGrafitis({ carpeta = CARPETA, parches = PARCHES } = {}) {
    const nombres = [...new Set(parches.map((p) => p.imagen))];
    const imagenes = new Map();
    await Promise.all(nombres.map(async (n) => {
        try { imagenes.set(n, await cargarImagen(carpeta + n)); } catch (e) { console.warn('[grafitis]', e.message); }
    }));
    return armarParcheador(imagenes, parches);
}

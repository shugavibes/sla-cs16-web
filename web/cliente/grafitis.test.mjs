// node --test web/cliente/grafitis.test.mjs
// Grafitis: se cambian texturas de un .wad sin romper el resto del archivo.
import assert from 'node:assert/strict';
import test from 'node:test';
import { armarMiptex, armarParcheador, cuantizar, indexar, leerMiptex, leerWad, reducir } from './grafitis.js';

function nombre16(texto) {
    const b = new Uint8Array(16);
    for (let i = 0; i < texto.length; i++) b[i] = texto.charCodeAt(i);
    return b;
}

// .wad de prueba: una piedra 16 × 16 de dos grises, un aerosol 16 × 16 y otro lump
function wadDePrueba() {
    const piedra = (() => {
        const w = 16;
        const mips = [256, 64, 16, 4].map((n) => Uint8Array.from({ length: n }, (_, i) => i % 2));
        const pal = new Uint8Array(768);
        pal.set([100, 90, 80, 160, 150, 130]);
        return armarMiptex(nombre16('-1PIEDRA'), w, w, mips, pal);
    })();
    const aerosol = armarMiptex(nombre16('{GRAF003'), 16, 16, [256, 64, 16, 4].map((n) => new Uint8Array(n).fill(200)),
        Object.assign(new Uint8Array(768), { 765: 255, 766: 127, 767: 0 }));
    const otro = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const lumps = [['-1PIEDRA', piedra, 0x43], ['{GRAF003', aerosol, 0x43], ['OTRO', otro, 0x40]];
    let tam = 12;
    const pos = lumps.map(([, d]) => { const p = tam; tam += d.length; return p; });
    const tabla = tam;
    const out = new Uint8Array(tabla + lumps.length * 32);
    const v = new DataView(out.buffer);
    out.set([87, 65, 68, 51]);   // WAD3
    v.setInt32(4, lumps.length, true);
    v.setInt32(8, tabla, true);
    lumps.forEach(([n, d, tipo], i) => {
        out.set(d, pos[i]);
        const o = tabla + i * 32;
        v.setInt32(o, pos[i], true);
        v.setInt32(o + 4, d.length, true);
        v.setInt32(o + 8, d.length, true);
        out[o + 12] = tipo;
        out.set(nombre16(n), o + 16);
    });
    return out;
}

const PARCHES = [
    { archivos: ['cstrike/prueba.wad'], textura: '-1PIEDRA', tipo: 'pared', imagen: 'pared.png' },
    { archivos: ['cstrike/prueba.wad'], textura: '{GRAF003', tipo: 'calco', imagen: 'calco.png', color: [19, 196, 116] },
];

function imagenes() {
    // pared: un cuadrado verde opaco arriba a la izquierda; calco: 32 × 16, mitad pintada
    const pared = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pared.set([19, 196, 116, 255], (y * 16 + x) * 4);
    const calco = new Uint8Array(32 * 16 * 4);
    for (let i = 0; i < 32 * 16; i++) { const a = i % 32 < 16 ? 255 : 0; calco.set([a, a, a, 255], i * 4); }
    return new Map([['pared.png', { ancho: 16, alto: 16, rgba: pared }], ['calco.png', { ancho: 32, alto: 16, rgba: calco }]]);
}

test('lee el índice y las texturas del .wad', () => {
    const wad = wadDePrueba();
    const e = leerWad(wad);
    assert.deepEqual([...e.keys()], ['-1PIEDRA', '{GRAF003', 'OTRO']);
    const t = leerMiptex(wad, e.get('-1PIEDRA'));
    assert.equal(t.ancho, 16);
    assert.deepEqual([...t.paleta.subarray(0, 6)], [100, 90, 80, 160, 150, 130]);
    assert.throws(() => leerWad(new Uint8Array(16)), /WAD3/);
});

test('pinta la pared y arma el aerosol de un color', () => {
    const wad = wadDePrueba();
    const parchear = armarParcheador(imagenes(), PARCHES, () => assert.fail('no debería avisar'));
    const nuevo = parchear('cstrike/prueba.wad', wad);
    assert.notEqual(nuevo, wad);
    const e = leerWad(nuevo);

    const pared = leerMiptex(nuevo, e.get('-1PIEDRA'));
    assert.equal(pared.ancho, 16);
    const color = (i) => [...pared.paleta.subarray(pared.indices[i] * 3, pared.indices[i] * 3 + 3)];
    const verde = color(0);
    assert.ok(verde[1] > verde[0] + 60 && verde[1] > verde[2], `arriba a la izquierda queda verde: ${verde}`);
    const piedra = color(15 * 16 + 15);
    assert.ok(Math.abs(piedra[0] - piedra[1]) < 25, `abajo a la derecha sigue la piedra: ${piedra}`);

    const calco = leerMiptex(nuevo, e.get('{GRAF003'));
    assert.equal(calco.ancho, 32, 'el aerosol puede cambiar de tamaño');
    assert.deepEqual([...calco.paleta.subarray(765)], [19, 196, 116], 'el último color es el de la pintura');
    assert.equal(calco.indices[0], 254);
    assert.equal(calco.indices[31], 0);
    assert.equal(new TextDecoder().decode(calco.nombre).replace(/\0+$/, ''), '{GRAF003');

    // lo demás queda igual
    const otro = e.get('OTRO');
    assert.deepEqual([...nuevo.subarray(otro.filepos, otro.filepos + 8)], [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual([...wad.subarray(0, wad.length)], [...nuevo.subarray(0, wad.length)].map((b, i) => {
        // solo cambian las entradas del índice de las dos texturas
        const tabla = new DataView(wad.buffer).getInt32(8, true);
        return i >= tabla && i < tabla + 64 ? wad[i] : b;
    }));
});

test('otros archivos y texturas que no coinciden quedan como estaban', () => {
    const wad = wadDePrueba();
    const parchear = armarParcheador(imagenes(), PARCHES, () => {});
    assert.equal(parchear('cstrike/otro.wad', wad), wad);
    const chica = new Map([['pared.png', { ancho: 8, alto: 8, rgba: new Uint8Array(256) }]]);
    const soloPared = armarParcheador(chica, PARCHES.slice(0, 1), () => {});
    assert.equal(soloPared('cstrike/prueba.wad', wad), wad, 'si el tamaño no coincide no se toca');
    const avisos = [];
    const roto = armarParcheador(imagenes(), PARCHES, (...a) => avisos.push(a.join(' ')));
    const basura = Uint8Array.from([87, 65, 68, 51, 9, 9, 9, 9, 9, 9, 9, 9]);
    assert.equal(roto('cstrike/prueba.wad', basura), basura);
    assert.equal(avisos.length, 1);
});

test('256 colores: los que hay se conservan', () => {
    const rgb = Uint8Array.from({ length: 300 * 3 }, (_, i) => (i % 3 === 1 ? 200 : 10 * ((i / 3) % 3 | 0)));
    const paleta = cuantizar(rgb);
    const idx = indexar(rgb, paleta);
    for (let i = 0; i < 300; i++) {
        for (let c = 0; c < 3; c++) assert.ok(Math.abs(paleta[idx[i] * 3 + c] - rgb[i * 3 + c]) <= 1);
    }
});

test('reduce a la mitad promediando', () => {
    assert.deepEqual([...reducir(Uint8Array.from([0, 100, 200, 100]), 2, 2, 1)], [100]);
});

test('aerosol a todo color: el índice 255 es el transparente (azul puro en la paleta)', async () => {
    const { texturaCalcoColor } = await import('./grafitis.js');
    const rgba = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < 256; i++) {
        const x = i % 16;
        if (x < 8) rgba.set([250, 210, 20, 255], i * 4);        // mitad amarilla
        else if (x < 12) rgba.set([10, 10, 10, 255], i * 4);    // un poco de negro
        // el resto, transparente
    }
    const datos = texturaCalcoColor(nombre16('{GRAF005'), 16, 16, rgba);
    const wad = (() => {
        // un .wad mínimo con esa textura, para leerla con las mismas funciones
        const out = new Uint8Array(12 + datos.length + 32);
        const v = new DataView(out.buffer);
        out.set([87, 65, 68, 51]); v.setInt32(4, 1, true); v.setInt32(8, 12 + datos.length, true);
        out.set(datos, 12);
        v.setInt32(12 + datos.length, 12, true); v.setInt32(16 + datos.length, datos.length, true);
        out[24 + datos.length] = 0x43; out.set(nombre16('{GRAF005'), 28 + datos.length);
        return out;
    })();
    const t = leerMiptex(wad, leerWad(wad).get('{GRAF005'));
    assert.deepEqual([...t.paleta.subarray(765)], [0, 0, 255]);
    assert.equal(t.indices[15], 255, 'transparente');
    assert.notEqual(t.indices[0], 255);
    assert.deepEqual([...t.paleta.subarray(t.indices[0] * 3, t.indices[0] * 3 + 3)], [250, 210, 20]);
    assert.deepEqual([...t.paleta.subarray(t.indices[9] * 3, t.indices[9] * 3 + 3)], [10, 10, 10]);
});

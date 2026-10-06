// node --test web/metricas.test.mjs
// Métricas: visitas, partidas y el resumen por día de /estadisticas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Metricas, diaDe, paginaClave, paginaEstadisticas, resumir } from './metricas.mjs';

const ZONA = 'America/Argentina/Buenos_Aires';
const HORA = 60 * 60 * 1000;
// martes 6 de octubre de 2026, 15:00 en Buenos Aires (18:00 UTC)
const BASE = Date.UTC(2026, 9, 6, 18, 0, 0);

function carpeta() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'metricas-'));
}

test('guarda visitas (sin repetir la misma persona enseguida) y partidas', () => {
    let ahora = BASE;
    const m = new Metricas(carpeta(), { reloj: () => ahora });
    assert.equal(m.visita('abcdefgh12'), true);
    assert.equal(m.visita('abcdefgh12'), false, 'recargar no suma');
    assert.equal(m.visita('x'), false, 'id raro: no se guarda');
    assert.equal(m.visita('../../etc'), false);
    const jugador = { id: 7, sala: '1', nombre: 'Shuga', desde: ahora };
    m.entra(jugador);
    ahora += 25 * 60 * 1000;
    m.sale(jugador);
    ahora += HORA;
    assert.equal(m.visita('abcdefgh12'), true, 'una hora después vuelve a contar');
    const ev = m.leer(BASE - HORA);
    assert.deepEqual(ev.map((e) => e.tipo), ['visita', 'entra', 'sale', 'visita']);
    assert.equal(ev[2].s, 1500);
    assert.equal(ev[2].nombre, 'Shuga');
    assert.ok(!JSON.stringify(ev).includes('127.0.0'), 'no hay IPs');
});

test('sin carpeta donde escribir, no rompe nada', () => {
    const avisos = [];
    const archivo = path.join(carpeta(), 'no-es-carpeta');
    fs.writeFileSync(archivo, '');
    const m = new Metricas(path.join(archivo, 'metricas'), { log: (t) => avisos.push(t) });
    assert.equal(m.activo, false);
    m.visita('abcdefgh12');
    m.entra({ id: 1, sala: '1', nombre: 'x' });
    assert.equal(avisos.length, 1);
});

test('el resumen cuenta por día de Argentina, jugadores distintos y el máximo a la vez', () => {
    const e = (h, ev) => ({ t: BASE + h * HORA, ...ev });
    const eventos = [
        e(-30, { tipo: 'visita', id: 'ayer1' }),                     // lunes
        e(-30, { tipo: 'entra', j: 1, sala: '1', nombre: 'Viejo' }),
        e(-29, { tipo: 'sale', j: 1, sala: '1', nombre: 'Viejo', s: 3600 }),
        e(-1, { tipo: 'visita', id: 'hoy1' }),
        e(-1, { tipo: 'visita', id: 'hoy1' }),
        e(-1, { tipo: 'visita', id: 'hoy2' }),
        e(-0.9, { tipo: 'entra', j: 2, sala: '1', nombre: 'Shuga' }),
        e(-0.8, { tipo: 'entra', j: 3, sala: '2', nombre: 'Tincho' }),
        e(-0.7, { tipo: 'entra', j: 4, sala: '1', nombre: 'shuga' }), // mismo nombre: un jugador
        e(-0.5, { tipo: 'sale', j: 2, sala: '1', nombre: 'Shuga', s: 1200 }),
        e(-0.4, { tipo: 'inicio' }),                                  // reinicio: se cortaron las demás
        e(-0.3, { tipo: 'entra', j: 1, sala: '3', nombre: 'Pepa' }),
    ];
    const r = resumir(eventos, { zona: ZONA, ahora: BASE, dias: 7 });
    assert.equal(r.dias.length, 7);
    assert.equal(r.hoy.dia, '2026-10-06');
    assert.equal(r.hoy.visitantes, 2);
    assert.equal(r.hoy.visitas, 3);
    assert.equal(r.hoy.jugadores, 3);   // shuga, tincho, pepa
    assert.equal(r.hoy.partidas, 4);
    assert.equal(r.hoy.pico, 3);
    assert.equal(r.hoy.minutos, 20);
    assert.equal(r.dias[1].dia, '2026-10-05');
    assert.equal(r.dias[1].jugadores, 1);
    assert.equal(r.total.jugadores, 4);
    assert.equal(r.total.visitantes, 3);
    assert.deepEqual(r.ultimas.map((u) => u.nombre), ['Shuga', 'Viejo']);
});

test('los días cambian a la medianoche de Argentina, no de Londres', () => {
    assert.equal(diaDe(Date.UTC(2026, 9, 7, 2, 0), ZONA), '2026-10-06');   // 23:00 del 6 en Buenos Aires
    assert.equal(diaDe(Date.UTC(2026, 9, 7, 3, 30), ZONA), '2026-10-07');
});

test('la página escapa los nombres y muestra quién juega ahora', () => {
    const resumen = resumir([], { zona: ZONA, ahora: BASE });
    const html = paginaEstadisticas({
        resumen, zona: ZONA, ahora: BASE, nombre: 'SLA',
        salas: [{ id: '1', nombre: 'Clásico' }],
        enLinea: [{ sala: '1', nombre: '<script>x</script>', desde: BASE - 10 * 60 * 1000 }, { sala: '1' }],
    });
    assert.ok(!html.includes('<script>x'));
    assert.ok(html.includes('&#60;script&#62;x'));
    assert.match(html, /Clásico/);
    assert.match(html, /10 min/);
    assert.match(html, /<b>1<\/b><span>jugando ahora/);
    assert.match(paginaClave({ error: true }), /Esa clave no es/);
});

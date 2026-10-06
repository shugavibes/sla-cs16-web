// Métricas: cuánta gente entra a la página y cuánta a jugar.
//
// Se guarda un evento por línea (JSON) en METRICAS/aaaa-mm.jsonl:
//   visita   alguien abrió la página (un id al azar que genera su navegador: sin IP ni datos)
//   entra    alguien entró a jugar a una sala, con el nombre que puso
//   sale     cuándo salió y cuántos segundos jugó
//   inicio   el servidor arrancó (las partidas que estaban abiertas se cortaron)
// La página /estadisticas?clave=... (CLAVE_ESTADISTICAS en .env) muestra el resumen.

import fs from 'node:fs';
import path from 'node:path';

const DIA_MS = 24 * 60 * 60 * 1000;
const VISITA_CADA_MS = 30 * 60 * 1000;   // la misma persona recargando no cuenta de nuevo
const mes = (t) => new Date(t).toISOString().slice(0, 7);

export class Metricas {
    constructor(dir, { reloj = Date.now, log = () => {} } = {}) {
        this.dir = dir;
        this.reloj = reloj;
        this.log = log;
        this.vistos = new Map();
        this.activo = false;
        try {
            fs.mkdirSync(dir, { recursive: true });
            fs.accessSync(dir, fs.constants.W_OK);
            this.activo = true;
        } catch (e) {
            log(`[métricas] no hay dónde guardarlas (${dir}): ${e.code || e.message}`);
        }
    }

    anotar(evento) {
        if (!this.activo) return;
        const t = this.reloj();
        try {
            fs.appendFileSync(path.join(this.dir, `${mes(t)}.jsonl`), `${JSON.stringify({ t, ...evento })}\n`);
        } catch (e) {
            this.activo = false;
            this.log(`[métricas] no pude guardar: ${e.code || e.message}`);
        }
    }

    visita(id) {
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) return false;
        const t = this.reloj();
        const antes = this.vistos.get(id);
        if (antes && t - antes < VISITA_CADA_MS) return false;
        if (this.vistos.size > 50000) this.vistos.clear();
        this.vistos.set(id, t);
        this.anotar({ tipo: 'visita', id });
        return true;
    }

    entra(p) {
        this.anotar({ tipo: 'entra', sala: p.sala, j: p.id, nombre: p.nombre });
    }

    sale(p) {
        const s = Math.max(0, Math.round((this.reloj() - (p.desde || this.reloj())) / 1000));
        this.anotar({ tipo: 'sale', sala: p.sala, j: p.id, nombre: p.nombre, s });
    }

    // Eventos desde `desde` (ms), en orden
    leer(desde) {
        const meses = new Set([mes(this.reloj())]);
        for (let t = desde; t < this.reloj(); t += 20 * DIA_MS) meses.add(mes(t));
        const eventos = [];
        for (const m of [...meses].sort()) {
            let texto;
            try {
                texto = fs.readFileSync(path.join(this.dir, `${m}.jsonl`), 'utf8');
            } catch {
                continue;
            }
            for (const linea of texto.split('\n')) {
                if (!linea) continue;
                try {
                    const e = JSON.parse(linea);
                    if (e.t >= desde) eventos.push(e);
                } catch { /* línea cortada */ }
            }
        }
        return eventos.sort((a, b) => a.t - b.t);
    }
}

export function diaDe(t, zona) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

// Resumen por día (el primero es hoy) y las últimas partidas
export function resumir(eventos, { zona = 'America/Argentina/Buenos_Aires', ahora = Date.now(), dias = 14 } = {}) {
    const claves = [...new Set(Array.from({ length: dias + 1 }, (_, i) => diaDe(ahora - i * DIA_MS, zona)))].slice(0, dias);
    const porDia = new Map(claves.map((dia) => [dia, {
        dia, visitas: 0, visitantes: new Set(), partidas: 0, jugadores: new Set(), sinNombre: 0, segundos: 0, pico: 0,
    }]));
    const ultimas = [];
    let dentro = 0;
    for (const e of eventos) {
        if (e.tipo === 'inicio') { dentro = 0; continue; }
        if (e.tipo === 'entra') dentro++;
        if (e.tipo === 'sale') { dentro = Math.max(0, dentro - 1); ultimas.push(e); }
        const d = porDia.get(diaDe(e.t, zona));
        if (!d) continue;
        if (e.tipo === 'visita') { d.visitas++; d.visitantes.add(e.id); }
        if (e.tipo === 'entra') {
            d.partidas++;
            if (e.nombre) d.jugadores.add(String(e.nombre).toLowerCase());
            else d.sinNombre++;   // recuperadas del registro de antes (sin nombres)
            d.pico = Math.max(d.pico, dentro);
        }
        if (e.tipo === 'sale') d.segundos += Number(e.s) || 0;
    }
    const visitantes = new Set();
    const jugadores = new Set();
    const filas = claves.map((k) => {
        const d = porDia.get(k);
        d.visitantes.forEach((v) => visitantes.add(v));
        d.jugadores.forEach((v) => jugadores.add(v));
        return {
            dia: d.dia, visitas: d.visitas, visitantes: d.visitantes.size, partidas: d.partidas,
            jugadores: d.jugadores.size, sinNombre: d.sinNombre, minutos: Math.round(d.segundos / 60), pico: d.pico,
        };
    });
    return {
        hoy: filas[0],
        dias: filas,
        total: {
            visitantes: visitantes.size,
            jugadores: jugadores.size,
            partidas: filas.reduce((s, f) => s + f.partidas, 0),
            minutos: filas.reduce((s, f) => s + f.minutos, 0),
        },
        ultimas: ultimas.slice(-30).reverse(),
    };
}

// ------------------------------------------------------------------ página
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function duracion(segundos) {
    const m = Math.round(segundos / 60);
    if (m < 1) return 'menos de 1 min';
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

const ESTILO = `
@font-face { font-family: Geist; src: url(/marca/fuentes/Geist-Variable.woff2) format("woff2"); font-weight: 100 900; }
:root { --bg: #0e0f0c; --panel: #181a16; --line: #ffffff1c; --text: #f2f2ee; --muted: #9ea39a; --accent: #13c474; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 Geist, system-ui, sans-serif; }
main { width: min(980px, 100%); margin: 0 auto; padding: 28px 16px 48px; }
header { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 22px; }
header img { height: 30px; }
h1 { margin: 0; font-size: 22px; }
.sub { color: var(--muted); font-size: 13px; }
h2 { margin: 28px 0 10px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.cifras { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.cifra { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.cifra b { display: block; font-size: 30px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.cifra span { color: var(--muted); font-size: 13px; }
.cifra.verde b { color: var(--accent); }
.ahora { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; }
.ahora p { margin: 4px 0; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { padding: 7px 8px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
th { color: var(--muted); font-weight: 500; font-size: 12.5px; }
th:first-child, td:first-child { text-align: left; }
td.barra { width: 34%; }
.barra i { display: block; height: 8px; border-radius: 4px; background: var(--accent); min-width: 2px; }
.tabla { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 4px 8px; }
.nota { color: var(--muted); font-size: 12.5px; margin-top: 26px; }
form { display: flex; gap: 8px; margin-top: 16px; }
input, button { font: inherit; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--text); }
button { background: var(--accent); color: #04140b; font-weight: 600; border: 0; }
`;

function marco(titulo, cuerpo, { refrescar = false } = {}) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
${refrescar ? '<meta http-equiv="refresh" content="60">' : ''}<title>${esc(titulo)}</title>
<style>${ESTILO}</style></head><body><main>${cuerpo}</main></body></html>`;
}

export function paginaClave({ error = false } = {}) {
    return marco('Estadísticas', `<header><img src="/marca/sla-logo.svg" alt="SLA"><h1>Estadísticas</h1></header>
<p>${error ? 'Esa clave no es. ' : ''}Escribí la clave de estadísticas (está en el servidor: <code>bash estadisticas.sh</code>).</p>
<form method="get" action="/estadisticas"><input name="clave" type="password" autocomplete="current-password" placeholder="Clave" required autofocus><button>Ver</button></form>`);
}

export function paginaEstadisticas({ resumen, enLinea = [], salas = [], nombre = '', zona, ahora = Date.now() }) {
    const hora = (t) => new Intl.DateTimeFormat('es-AR', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
    const cuando = (t) => {
        if (diaDe(t, zona) === diaDe(ahora, zona)) return `hoy ${hora(t)}`;
        const dia = new Intl.DateTimeFormat('es-AR', { timeZone: zona, weekday: 'short', day: 'numeric' }).format(t);
        return `${dia} · ${hora(t)}`;
    };
    const fecha = (dia) => {
        const [a, m, d] = dia.split('-').map(Number);
        return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
            .format(Date.UTC(a, m - 1, d));
    };
    const nombreSala = (id) => salas.find((s) => s.id === id)?.nombre || `Sala ${id}`;
    const h = resumen.hoy;
    const maxV = Math.max(1, ...resumen.dias.map((d) => d.visitantes));

    const porSala = new Map();
    for (const p of enLinea) {
        if (!porSala.has(p.sala)) porSala.set(p.sala, []);
        porSala.get(p.sala).push(p);
    }
    const ahoraHtml = enLinea.length
        ? [...porSala].map(([sala, lista]) => `<p><b>${esc(nombreSala(sala))}:</b> ${lista.map((p) =>
            `${esc(p.nombre || 'entrando…')}${p.desde ? ` <span class="sub">(${duracion((ahora - p.desde) / 1000)})</span>` : ''}`).join(', ')}</p>`).join('')
        : '<p class="sub">Nadie jugando en este momento.</p>';

    const jugaron = (d) => (d.jugadores || !d.sinNombre ? d.jugadores : '—');
    const filas = resumen.dias.map((d) => `<tr><td>${esc(fecha(d.dia))}</td><td>${d.visitantes}</td><td>${jugaron(d)}</td>
<td>${d.partidas}</td><td>${d.pico}</td><td>${d.minutos ? duracion(d.minutos * 60) : '—'}</td>
<td class="barra"><i style="width:${Math.round((d.visitantes / maxV) * 100)}%"></i></td></tr>`).join('');

    const ultimas = resumen.ultimas.length
        ? resumen.ultimas.slice(0, 20).map((e) => `<tr><td>${esc(cuando(e.t))}</td><td>${esc(e.nombre || '—')}</td><td>${esc(nombreSala(e.sala))}</td><td>${duracion(e.s || 0)}</td></tr>`).join('')
        : '<tr><td colspan="4" class="sub">Todavía no hay partidas terminadas.</td></tr>';

    return marco('Estadísticas', `<header><img src="/marca/sla-logo.svg" alt="SLA"><div><h1>Estadísticas</h1>
<div class="sub">${esc(nombre)} · se actualiza solo cada minuto · ${esc(hora(ahora))}</div></div></header>

<h2>Ahora</h2>
<div class="cifras"><div class="cifra verde"><b>${enLinea.filter((p) => p.nombre).length}</b><span>jugando ahora</span></div></div>
<div class="ahora" style="margin-top:10px">${ahoraHtml}</div>

<h2>Hoy</h2>
<div class="cifras">
<div class="cifra"><b>${h.visitantes}</b><span>personas abrieron la página</span></div>
<div class="cifra"><b>${jugaron(h)}</b><span>jugaron</span></div>
<div class="cifra"><b>${h.partidas}</b><span>partidas</span></div>
<div class="cifra"><b>${h.pico}</b><span>jugando a la vez (máximo)</span></div>
<div class="cifra"><b>${h.minutos ? duracion(h.minutos * 60) : '—'}</b><span>tiempo jugado</span></div>
</div>

<h2>Últimos ${resumen.dias.length} días</h2>
<div class="cifras" style="margin-bottom:10px">
<div class="cifra"><b>${resumen.total.visitantes}</b><span>personas distintas abrieron la página</span></div>
<div class="cifra"><b>${resumen.total.jugadores}</b><span>jugadores distintos</span></div>
<div class="cifra"><b>${resumen.total.partidas}</b><span>partidas</span></div>
</div>
<div class="tabla"><table><thead><tr><th>Día</th><th>Personas</th><th>Jugaron</th><th>Partidas</th><th>A la vez</th><th>Tiempo jugado</th><th></th></tr></thead>
<tbody>${filas}</tbody></table></div>

<h2>Últimas partidas</h2>
<div class="tabla"><table><thead><tr><th>Salió</th><th>Jugador</th><th>Sala</th><th>Duró</th></tr></thead><tbody>${ultimas}</tbody></table></div>

<p class="nota">«Personas» son navegadores distintos que abrieron la página (cada uno guarda un número al azar; no se guardan IPs).
«Jugaron» cuenta nombres distintos que entraron a una sala. Lo de antes de las estadísticas (bash recuperar-historial.sh) sale del registro de la web: partidas y horarios, sin nombres ni visitas.</p>`, { refrescar: true });
}

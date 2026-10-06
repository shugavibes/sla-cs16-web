// node --test web/cliente/teclas.test.mjs
// Agacharse también con Alt, y aviso si el navegador quiso cerrar la pestaña.
import assert from 'node:assert/strict';
import test from 'node:test';
import { activarTeclas, engancharMotor, esMac, mensajeSalida } from './teclas.js';

function motorFalso({ running = false } = {}) {
    const comandos = [];
    return { comandos, running, Cmd_ExecuteString(c) { comandos.push(c); } };
}

function ventanaFalsa({ plataforma = 'Win32', jugando = true } = {}) {
    const oyentes = {};
    return {
        navigator: { platform: plataforma },
        document: { body: { classList: { contains: (c) => c === 'playing' && jugando } } },
        addEventListener(tipo, f) { (oyentes[tipo] ||= []).push(f); },
        disparar(tipo, e = {}) { for (const f of oyentes[tipo] || []) f(e); },
    };
}

function tecla(datos) {
    return { ...datos, prevenida: false, preventDefault() { this.prevenida = true; } };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('Alt agacha: el bind va antes de conectarse', () => {
    const motor = motorFalso();
    assert.equal(engancharMotor(motor), true);
    motor.Cmd_ExecuteString('name "x"');
    motor.Cmd_ExecuteString('connect sala');
    assert.deepEqual(motor.comandos, ['name "x"', 'bind alt +duck', 'connect sala']);
    assert.equal(engancharMotor(motor), false);
});

test('reconoce la Mac', () => {
    assert.equal(esMac({ platform: 'MacIntel' }), true);
    assert.equal(esMac({ userAgentData: { platform: 'macOS' } }), true);
    assert.equal(esMac({ platform: 'iPhone' }), true);
    assert.equal(esMac({ platform: 'Win32' }), false);
    assert.equal(esMac({ platform: 'Linux x86_64' }), false);
});

test('fuera de la Mac, Alt no dispara atajos del navegador mientras se juega', () => {
    const v = ventanaFalsa({ plataforma: 'Win32' });
    activarTeclas({ ventana: v });
    const altD = tecla({ key: 'd', altKey: true, ctrlKey: false });
    v.disparar('keydown', altD);
    assert.equal(altD.prevenida, true);
    const soltarAlt = tecla({ key: 'Alt' });
    v.disparar('keyup', soltarAlt);
    assert.equal(soltarAlt.prevenida, true);
    const w = tecla({ key: 'w', altKey: false });
    v.disparar('keydown', w);
    assert.equal(w.prevenida, false);
});

test('en la Mac, ⌥ queda libre (sirve para escribir @ en el chat)', () => {
    const v = ventanaFalsa({ plataforma: 'MacIntel' });
    activarTeclas({ ventana: v });
    const optDos = tecla({ key: '@', altKey: true, ctrlKey: false });
    v.disparar('keydown', optDos);
    assert.equal(optDos.prevenida, false);
});

test('si sale el cartel de salir y te quedás, avisa que uses Alt', async () => {
    const v = ventanaFalsa();
    const avisos = [];
    activarTeclas({ ventana: v, avisar: (t) => avisos.push(t) });
    v.disparar('keydown', tecla({ key: 'Control' }));
    v.disparar('beforeunload');
    await esperar(450);
    assert.deepEqual(avisos, [mensajeSalida(true)]);
    v.disparar('blur');
    v.disparar('beforeunload');
    await esperar(450);
    assert.equal(avisos[1], mensajeSalida(false));
});

test('sin estar jugando no avisa nada', async () => {
    const v = ventanaFalsa({ jugando: false });
    const avisos = [];
    activarTeclas({ ventana: v, avisar: (t) => avisos.push(t) });
    v.disparar('beforeunload');
    await esperar(450);
    assert.deepEqual(avisos, []);
});

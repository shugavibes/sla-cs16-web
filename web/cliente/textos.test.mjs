// node --test web/cliente/textos.test.mjs
// Textos más grandes: hud_scale según la densidad de la pantalla, mandado antes de «connect».
import assert from 'node:assert/strict';
import test from 'node:test';
import { agrandarTextos, engancharMotor, escalaHud } from './textos.js';

function motorFalso({ running = false } = {}) {
    const comandos = [];
    return { comandos, running, Cmd_ExecuteString(c) { comandos.push(c); } };
}

function ventanaFalsa(datos) {
    const oyentes = {};
    return {
        ...datos,
        addEventListener(tipo, f) { (oyentes[tipo] ||= []).push(f); },
        disparar(tipo) { for (const f of oyentes[tipo] || []) f(); },
    };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('la escala sigue a la densidad de la pantalla, entre 1 y 3', () => {
    assert.equal(escalaHud({ densidad: 2, ancho: 1440, alto: 800 }), 2);   // Mac con Retina: el doble
    assert.equal(escalaHud({ densidad: 1, ancho: 1920, alto: 1000 }), 1);  // pantalla común: igual que antes
    assert.equal(escalaHud({ densidad: 1.3 }), 1.25);
    assert.equal(escalaHud({ densidad: 2.625 }), 2.5);
    assert.equal(escalaHud({ densidad: 4 }), 3);
    assert.equal(escalaHud({ densidad: 0.5 }), 1);
    assert.equal(escalaHud({}), 1);
});

test('el HUD nunca queda más chico que 640 × 480', () => {
    assert.equal(escalaHud({ densidad: 2, ancho: 580, alto: 788 }), 1.75);   // ventana angosta
    assert.equal(escalaHud({ densidad: 3, ancho: 844, alto: 390 }), 2.25);   // iPhone acostado
    assert.equal(escalaHud({ densidad: 3, ancho: 800, alto: 360 }), 2.25);   // Android acostado
    assert.equal(escalaHud({ densidad: 2, ancho: 667, alto: 375 }), 1.5);    // iPhone SE acostado
    assert.equal(escalaHud({ densidad: 2, ancho: 300, alto: 200 }), 1);
});

test('?hud= elige la escala a mano (con el mismo límite de tamaño)', () => {
    assert.equal(escalaHud({ densidad: 2, elegida: '1' }), 1);
    assert.equal(escalaHud({ densidad: 1, elegida: '1.5' }), 1.5);
    assert.equal(escalaHud({ densidad: 2, elegida: '9' }), 3);
    assert.equal(escalaHud({ densidad: 2, ancho: 1440, alto: 800, elegida: '3' }), 3);
    assert.equal(escalaHud({ densidad: 1, ancho: 1440, alto: 800, elegida: '3' }), 1.5);
    assert.equal(escalaHud({ densidad: 2, elegida: 'abc' }), 2);
    assert.equal(escalaHud({ densidad: 2, elegida: '' }), 2);
});

test('hud_scale va justo antes de cada connect', () => {
    const motor = motorFalso();
    assert.equal(typeof engancharMotor(motor, () => 'hud_scale 2'), 'function');
    motor.Cmd_ExecuteString('name "Shuga"');
    motor.Cmd_ExecuteString('connect 127.0.0.1:27015');
    motor.Cmd_ExecuteString('say hola');
    motor.Cmd_ExecuteString('retry');
    assert.deepEqual(motor.comandos,
        ['name "Shuga"', 'hud_scale 2', 'connect 127.0.0.1:27015', 'say hola', 'hud_scale 2', 'retry']);
    assert.equal(engancharMotor(motor, () => 'hud_scale 2'), null, 'no se engancha dos veces');
});

test('si el motor ya estaba jugando, lo manda en el momento', () => {
    const motor = motorFalso({ running: true });
    engancharMotor(motor, () => 'hud_scale 2');
    assert.deepEqual(motor.comandos, ['hud_scale 2']);
});

test('espera al motor, se engancha y se ajusta al cambiar el tamaño', async () => {
    const ventana = ventanaFalsa({ devicePixelRatio: 2, innerWidth: 1440, innerHeight: 800 });
    assert.equal(agrandarTextos({ ventana }), true);
    await esperar(150);
    ventana.xash = motorFalso();
    await esperar(250);
    ventana.xash.Cmd_ExecuteString('connect sala');
    ventana.xash.running = true;
    ventana.disparar('resize');                      // mismo tamaño: no repite
    ventana.innerWidth = 580;
    ventana.disparar('resize');                      // ventana angosta: 1.75
    assert.deepEqual(ventana.xash.comandos, ['hud_scale 2', 'connect sala', 'hud_scale 1.75']);
});

test('en una pantalla común no hace nada', () => {
    const ventana = ventanaFalsa({ devicePixelRatio: 1, xash: motorFalso() });
    assert.equal(agrandarTextos({ ventana }), false);
    assert.equal(ventana.xash.cs16Textos, undefined);
});

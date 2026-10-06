// node --test web/cliente/textos.test.mjs
// Textos más grandes: hud_scale según la densidad de la pantalla, mandado antes de «connect».
import assert from 'node:assert/strict';
import test from 'node:test';
import { agrandarTextos, comandosHud, engancharMotor, escalaHud } from './textos.js';

function motorFalso({ running = false } = {}) {
    const comandos = [];
    return { comandos, running, Cmd_ExecuteString(c) { comandos.push(c); } };
}

test('la escala sigue a la densidad de la pantalla, entre 1 y 3', () => {
    assert.equal(escalaHud(2), 2);          // Mac con Retina: el doble
    assert.equal(escalaHud(3), 3);          // celular
    assert.equal(escalaHud(1), 1);          // pantalla común: igual que antes
    assert.equal(escalaHud(1.3), 1.25);
    assert.equal(escalaHud(2.625), 2.75);
    assert.equal(escalaHud(4), 3);
    assert.equal(escalaHud(0.5), 1);
    assert.equal(escalaHud(undefined), 1);
});

test('?hud= elige la escala a mano', () => {
    assert.equal(escalaHud(2, '1'), 1);
    assert.equal(escalaHud(1, '1.5'), 1.5);
    assert.equal(escalaHud(2, '9'), 3);
    assert.equal(escalaHud(2, 'abc'), 2);
    assert.equal(escalaHud(2, ''), 2);
});

test('con escala 1 no se manda nada', () => {
    assert.deepEqual(comandosHud(1), []);
    assert.deepEqual(comandosHud(2), ['hud_scale 2']);
});

test('hud_scale va justo antes de cada connect y solo ahí', () => {
    const motor = motorFalso();
    assert.equal(engancharMotor(motor, ['hud_scale 2']), true);
    motor.Cmd_ExecuteString('name "Shuga"');
    motor.Cmd_ExecuteString('connect 127.0.0.1:27015');
    motor.Cmd_ExecuteString('say hola');
    motor.Cmd_ExecuteString('retry');
    assert.deepEqual(motor.comandos,
        ['name "Shuga"', 'hud_scale 2', 'connect 127.0.0.1:27015', 'say hola', 'hud_scale 2', 'retry']);
    assert.equal(engancharMotor(motor, ['hud_scale 2']), false, 'no se engancha dos veces');
});

test('si el motor ya estaba jugando, lo manda en el momento', () => {
    const motor = motorFalso({ running: true });
    engancharMotor(motor, ['hud_scale 2']);
    assert.deepEqual(motor.comandos, ['hud_scale 2']);
});

test('espera a que aparezca el motor y se engancha', async () => {
    const ventana = { devicePixelRatio: 2 };
    assert.equal(agrandarTextos({ ventana }), 2);
    await new Promise((r) => setTimeout(r, 150));
    ventana.xash = motorFalso();
    await new Promise((r) => setTimeout(r, 250));
    ventana.xash.Cmd_ExecuteString('connect sala');
    assert.deepEqual(ventana.xash.comandos, ['hud_scale 2', 'connect sala']);
});

test('en una pantalla común no hace nada', () => {
    const ventana = { devicePixelRatio: 1, xash: motorFalso() };
    assert.equal(agrandarTextos({ ventana }), 1);
    assert.equal(ventana.xash.cs16Textos, undefined);
});

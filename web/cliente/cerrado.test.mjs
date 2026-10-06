// node --test web/cliente/cerrado.test.mjs
// «Cerrado por ahora»: el mensaje sale de marca/web/cerrado.txt (lo crea ./cerrar.sh).
import assert from 'node:assert/strict';
import test from 'node:test';
import { mensajeCerrado } from './cerrado.js';

const respuesta = (status, texto = '') => async () => ({ ok: status === 200, status, text: async () => texto });

test('con el archivo, devuelve el mensaje', async () => {
    assert.equal(await mensajeCerrado(respuesta(200, '  Volvemos mañana a las 20 h\n')), 'Volvemos mañana a las 20 h');
});

test('sin archivo, vacío o sin red, la página sigue normal', async () => {
    assert.equal(await mensajeCerrado(respuesta(404)), null);
    assert.equal(await mensajeCerrado(respuesta(200, '   \n')), null);
    assert.equal(await mensajeCerrado(async () => { throw new Error('sin red'); }), null);
});

test('un mensaje larguísimo se corta', async () => {
    assert.equal((await mensajeCerrado(respuesta(200, 'x'.repeat(2000)))).length, 500);
});

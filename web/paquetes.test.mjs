// node --test web/paquetes.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { esRcon } from './paquetes.mjs';

const sinConexion = (texto) => Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from(texto, 'latin1')]);

test('descarta los pedidos de RCON que llegan desde el navegador', () => {
    assert.ok(esRcon(sinConexion('challenge rcon\n')));
    assert.ok(esRcon(sinConexion('rcon 12345 "clave" status')));
    assert.ok(esRcon(sinConexion('RCON 1 x quit')));
    assert.ok(esRcon(new Uint8Array(sinConexion('rcon 1 x status'))));
});

test('deja pasar el resto del tráfico del juego', () => {
    assert.ok(!esRcon(sinConexion('getchallenge steam\n')));
    assert.ok(!esRcon(sinConexion('connect 48 123 "\\prot\\3"')));
    assert.ok(!esRcon(sinConexion('TSource Engine Query\0')));
    assert.ok(!esRcon(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x72, 0x63, 0x6f, 0x6e, 0x20])));   // paquete de juego normal
    assert.ok(!esRcon(Buffer.from([0xff, 0xff])));
    assert.ok(!esRcon(null));
});

test('saca el nombre del pedido de conexión (para las métricas)', async () => {
    const { nombreDeConexion } = await import('./paquetes.mjs');
    assert.equal(nombreDeConexion(sinConexion('connect 49 1234 "\\prot\\3\\unique\\-1" "\\_vgui_menus\\0\\name\\Shuga\\rate\\100000"')), 'Shuga');
    const utf8 = (t) => Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from(t, 'utf8')]);
    assert.equal(nombreDeConexion(utf8('connect 48 1 "\\prot\\3" "\\name\\José Ñandú\\model\\gign"')), 'José Ñandú');
    assert.equal(nombreDeConexion(sinConexion('getchallenge steam\n')), null);
    assert.equal(nombreDeConexion(sinConexion('connect 48 1 "\\prot\\3" "\\rate\\1"')), null);
    assert.equal(nombreDeConexion(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x63, 0x6f, 0x6e, 0x6e, 0x65, 0x63, 0x74, 0x20])), null);
});

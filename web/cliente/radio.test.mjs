// node --test web/cliente/radio.test.mjs
// Radio con Z, X y C: se reconoce el menú que mandó el servidor y se arma la lista.
import assert from 'node:assert/strict';
import test from 'node:test';
import { MENUS, htmlMenu, menuDeLinea } from './radio.js';

test('reconoce los menús de radio en la consola del juego', () => {
    assert.equal(menuDeLinea('execing touch/radioa.cfg'), 'radioa');
    assert.equal(menuDeLinea('[23:41:02] execing touch/radiob.cfg'), 'radiob');
    assert.equal(menuDeLinea('execing touch/radioc.cfg'), 'radioc');
    assert.equal(menuDeLinea('execing touch/radioselector.cfg'), null);
    assert.equal(menuDeLinea('execing touch/buy.cfg'), null);
    assert.equal(menuDeLinea('Player (RADIO): Cover me!'), null);
    assert.equal(menuDeLinea(undefined), null);
});

test('las opciones están en el orden del juego (el número elige)', () => {
    assert.equal(MENUS.radioa.opciones.length, 6);
    assert.equal(MENUS.radiob.opciones.length, 6);
    assert.equal(MENUS.radioc.opciones.length, 9);
    assert.equal(MENUS.radioc.opciones[1], 'Enemigo a la vista');
    assert.equal(MENUS.radiob.opciones[0], '¡Vamos, vamos!');
});

test('la lista numera desde 1 y tiene el 0 para cerrar', () => {
    const html = htmlMenu('radioc');
    assert.match(html, /<b>1<\/b> Afirmativo/);
    assert.match(html, /<b>9<\/b> Enemigo abatido/);
    assert.match(html, /<b>0<\/b> Cerrar/);
    assert.match(html, /<kbd>C<\/kbd>/);
    assert.equal(htmlMenu('nada'), '');
});

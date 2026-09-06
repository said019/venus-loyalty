// Anticipo ligado a una cita: la guarda que impide que el dinero de una
// clienta quede apuntando a la cita de otra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mismoTelefono, soloDigitos } from '../src/utils/phone.js';

test('mismo número con y sin lada 52 se reconoce como la misma clienta', () => {
  // La cita entró por /agendar (12 dígitos) y la tarjeta por mostrador (10).
  assert.equal(mismoTelefono('524272787303', '4272787303'), true);
  assert.equal(mismoTelefono('4272787303', '524272787303'), true);
});

test('formatos con espacios, guiones o paréntesis no rompen la comparación', () => {
  assert.equal(mismoTelefono('(427) 278-7303', '4272787303'), true);
  assert.equal(mismoTelefono('+52 427 278 7303', '524272787303'), true);
});

test('teléfonos distintos NO se confunden — es la guarda del dinero', () => {
  assert.equal(mismoTelefono('4272787303', '5514599238'), false);
});

test('coincidir solo en los últimos dígitos no basta', () => {
  assert.equal(mismoTelefono('4272787303', '9999997303'), false);
});

test('datos incompletos se rechazan en vez de adivinar', () => {
  assert.equal(mismoTelefono('', '4272787303'), false);
  assert.equal(mismoTelefono(null, '4272787303'), false);
  assert.equal(mismoTelefono(undefined, undefined), false);
  assert.equal(mismoTelefono('7303', '4272787303'), false);
});

test('soloDigitos limpia todo lo que no sea número', () => {
  assert.equal(soloDigitos('+52 (427) 278-7303'), '524272787303');
  assert.equal(soloDigitos(null), '');
});

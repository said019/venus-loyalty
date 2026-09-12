// tests/mexicoDayRange.test.js
// Run: node --test tests/mexicoDayRange.test.js
//
// Las ventas del Coffee Bar se filtraban por día UTC (`new Date('2026-07-29')`),
// que en México es 18:00 del día ANTERIOR. Resultado: un café vendido a las 19:00
// caía en el corte del día siguiente y faltaba en el del día en que se cobró.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startOfDayMexico, endOfDayMexico } from '../src/utils/mexico-time.js';

test('el día natural de México va de 06:00 UTC a 05:59 UTC del siguiente', () => {
  assert.equal(startOfDayMexico('2026-07-29').toISOString(), '2026-07-29T06:00:00.000Z');
  assert.equal(endOfDayMexico('2026-07-29').toISOString(), '2026-07-30T05:59:59.999Z');
});

test('una venta de las 19:00 en México cae DENTRO de su propio día', () => {
  const venta = new Date('2026-07-29T19:00:00-06:00'); // 01:00 UTC del 30
  assert.ok(venta >= startOfDayMexico('2026-07-29'), 'debe entrar al corte del 29');
  assert.ok(venta <= endOfDayMexico('2026-07-29'));
  // Y NO debe colarse en el corte del día siguiente
  assert.ok(venta < startOfDayMexico('2026-07-30'));
});

test('una venta de las 08:00 no se adelanta al día anterior', () => {
  const venta = new Date('2026-07-29T08:00:00-06:00');
  assert.ok(venta > endOfDayMexico('2026-07-28'));
  assert.ok(venta >= startOfDayMexico('2026-07-29'));
});

test('un valor que no es YYYY-MM-DD se pasa tal cual a Date', () => {
  const iso = '2026-07-29T15:30:00-06:00';
  assert.equal(startOfDayMexico(iso).toISOString(), new Date(iso).toISOString());
  assert.equal(endOfDayMexico(iso).toISOString(), new Date(iso).toISOString());
});

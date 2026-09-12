import { test } from "node:test";
import assert from "node:assert/strict";

// Test de la lógica de comisiones (sin DB — lógica pura)

function calculateCommissionTotals(commissions) {
  const pendiente = commissions
    .filter(c => c.status === 'pendiente')
    .reduce((sum, c) => sum + c.amount, 0);
  const pagada = commissions
    .filter(c => c.status === 'pagada')
    .reduce((sum, c) => sum + c.amount, 0);
  const cancelada = commissions
    .filter(c => c.status === 'cancelada')
    .reduce((sum, c) => sum + c.amount, 0);
  return { pendiente, pagada, cancelada, total: commissions.length };
}

test("Totales vacíos = 0", () => {
  const totals = calculateCommissionTotals([]);
  assert.equal(totals.pendiente, 0);
  assert.equal(totals.pagada, 0);
  assert.equal(totals.cancelada, 0);
  assert.equal(totals.total, 0);
});

test("Una comisión pendiente = monto correcto", () => {
  const totals = calculateCommissionTotals([
    { status: 'pendiente', amount: 50 },
  ]);
  assert.equal(totals.pendiente, 50);
  assert.equal(totals.pagada, 0);
  assert.equal(totals.total, 1);
});

test("Mixto: 2 pendientes, 1 pagada, 1 cancelada", () => {
  const totals = calculateCommissionTotals([
    { status: 'pendiente', amount: 50 },
    { status: 'pendiente', amount: 50 },
    { status: 'pagada', amount: 50 },
    { status: 'cancelada', amount: 50 },
  ]);
  assert.equal(totals.pendiente, 100);
  assert.equal(totals.pagada, 50);
  assert.equal(totals.cancelada, 50);
  assert.equal(totals.total, 4);
});

test("Comisión cancelada no suma a pendiente ni pagada", () => {
  const totals = calculateCommissionTotals([
    { status: 'pendiente', amount: 100 },
    { status: 'cancelada', amount: 50 },
  ]);
  assert.equal(totals.pendiente, 100);
  assert.equal(totals.cancelada, 50);
  assert.equal(totals.pagada, 0);
});
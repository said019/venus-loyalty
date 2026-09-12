// tests/metodosPago.test.js
// Run: node --test tests/metodosPago.test.js
//
// El mismo cobro se guarda con etiquetas distintas según el origen:
//   · modal de pago de citas y Venta Rápida → "tarjeta_credito" / "tarjeta_debito"
//   · POS del café y el otro modal de cobro → "tarjeta"
// El reporte de Ventas comparaba con === 'tarjeta', así que esos cobros no
// entraban en NINGUNA tarjeta del resumen: el total de ingresos salía bien pero
// Efectivo + Tarjeta + Transferencia sumaba menos que el total.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadPagos() {
  const src = fs.readFileSync('public/js/admin/core/pagos.js', 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.__adminPagos;
}

test('todas las variantes de tarjeta caen en "tarjeta"', () => {
  const { normalizarMetodoPago } = loadPagos();
  for (const m of ['tarjeta', 'tarjeta_credito', 'tarjeta_debito', 'Tarjeta_Credito', 'card']) {
    assert.equal(normalizarMetodoPago(m), 'tarjeta', `falló con "${m}"`);
  }
});

test('efectivo y transferencia se normalizan', () => {
  const { normalizarMetodoPago } = loadPagos();
  assert.equal(normalizarMetodoPago('efectivo'), 'efectivo');
  assert.equal(normalizarMetodoPago('cash'), 'efectivo');
  assert.equal(normalizarMetodoPago('transferencia'), 'transferencia');
  assert.equal(normalizarMetodoPago('transfer'), 'transferencia');
});

test('lo desconocido o vacío cae en efectivo (nunca se pierde el ingreso)', () => {
  const { normalizarMetodoPago } = loadPagos();
  for (const m of [null, undefined, '', 'vale', 'otro']) {
    assert.equal(normalizarMetodoPago(m), 'efectivo');
  }
});

test('el desglose por método suma exactamente el total de ingresos', () => {
  const { normalizarMetodoPago } = loadPagos();
  // Un mes con las cuatro fuentes de ingreso y sus etiquetas reales
  const ventas = [
    { totalPaid: 800, paymentMethod: 'efectivo' },          // cita
    { totalPaid: 1200, paymentMethod: 'tarjeta_credito' },  // cita (modal de pago)
    { totalPaid: 450, paymentMethod: 'tarjeta_debito' },    // venta rápida
    { totalPaid: 65, paymentMethod: 'tarjeta' },            // café (POS)
    { totalPaid: 300, paymentMethod: 'transferencia' },     // ingreso manual
  ];

  const totales = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  let totalIngresos = 0;
  for (const v of ventas) {
    totalIngresos += v.totalPaid;
    totales[normalizarMetodoPago(v.paymentMethod)] += v.totalPaid;
  }

  assert.equal(totalIngresos, 2815);
  assert.equal(totales.efectivo + totales.tarjeta + totales.transferencia, totalIngresos,
    'el desglose por método debe cuadrar con el total');
  assert.equal(totales.tarjeta, 1715); // 1200 + 450 + 65
});

test('las etiquetas se leen bien en la tabla del reporte', () => {
  const { etiquetaMetodoPago } = loadPagos();
  assert.equal(etiquetaMetodoPago('tarjeta_credito'), 'Tarjeta de crédito');
  assert.equal(etiquetaMetodoPago('tarjeta_debito'), 'Tarjeta de débito');
  assert.equal(etiquetaMetodoPago('tarjeta'), 'Tarjeta');
  assert.equal(etiquetaMetodoPago('efectivo'), 'Efectivo');
  assert.equal(etiquetaMetodoPago('transferencia'), 'Transferencia');
});

test('la cuenta contable separa caja de banco', () => {
  const { cuentaDeMetodoPago } = loadPagos();
  assert.equal(cuentaDeMetodoPago('efectivo'), 'Caja');
  assert.equal(cuentaDeMetodoPago('tarjeta_credito'), 'BBVA Aho');
  assert.equal(cuentaDeMetodoPago('transferencia', 'BBVA Alo'), 'BBVA Alo');
});

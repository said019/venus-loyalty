// tests/directSale.test.js
// Run: node --test tests/directSale.test.js
//
// Bug real (jul-2026, mostrador): meter un producto de barra (café) en
// "Nueva venta" y cobrar marcaba error — con descuento y sin descuento.
// Causa: POST /api/direct-sales guardaba con
//   firestore.collection('sales').add({ type: 'direct', … })
// y la capa compat traduce eso a prisma.sale.create(). El modelo Sale NUNCA
// tuvo columna `type`, y ese payload tampoco mandaba `total` ni `date` (los dos
// obligatorios) → "Unknown argument `type`" y ninguna venta directa se guardaba.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectSaleRecord, DIRECT_SALE_FIELDS } from '../src/services/directSale.js';

// Payload tal como lo manda saveDirectSale() del panel con un item de barra.
const ventaDeBarra = {
  clientName: 'Venta directa',
  paymentMethod: 'efectivo',
  productsAmount: 65,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  totalAmount: 65,
  productsSold: [
    { productId: 'coffee:abc123:size-grande', name: 'Latte (Grande)', price: 65, qty: 1, subtotal: 65 },
  ],
};

const FECHA = new Date('2026-07-29T18:00:00.000Z');

test('venta de barra SIN descuento: solo campos que el modelo Sale conoce', () => {
  const rec = buildDirectSaleRecord(ventaDeBarra, FECHA);

  for (const campo of Object.keys(rec)) {
    assert.ok(DIRECT_SALE_FIELDS.includes(campo), `campo desconocido para Prisma Sale: ${campo}`);
  }
  // El campo que tumbaba el create
  assert.equal('type' in rec, false, 'el registro no debe llevar `type`');
  // Obligatorios en el modelo Sale
  assert.equal(rec.subtotal, 65);
  assert.equal(rec.totalAmount, 65);
  assert.ok(rec.date instanceof Date);
  assert.equal(rec.paymentMethod, 'efectivo');
  // Marcadores de "venta sin cita" que usa el corte de caja
  assert.equal(rec.appointmentId, null);
  assert.equal(rec.serviceName, null);
});

test('venta de barra CON descuento: el descuento se recalcula en el servidor', () => {
  const rec = buildDirectSaleRecord(
    { ...ventaDeBarra, discountType: 'percent', discountValue: 10, discountAmount: 999, totalAmount: 1 },
    FECHA
  );
  assert.equal(rec.discountType, 'percent');
  assert.equal(rec.discountValue, 10);
  assert.equal(rec.discountAmount, 7); // 10% de 65, redondeado
  assert.equal(rec.totalAmount, 58);
  assert.equal(rec.subtotal, 65);
});

test('descuento fijo mayor al total no deja el total en negativo', () => {
  const rec = buildDirectSaleRecord(
    { ...ventaDeBarra, discountType: 'fixed', discountValue: 500 },
    FECHA
  );
  assert.equal(rec.discountAmount, 65);
  assert.equal(rec.totalAmount, 0);
});

test('descuento inválido o sin tipo se ignora (no rompe el cobro)', () => {
  const rec = buildDirectSaleRecord({ ...ventaDeBarra, discountType: 'regalo', discountValue: 50 }, FECHA);
  assert.equal(rec.discountType, null);
  assert.equal(rec.discountValue, 0);
  assert.equal(rec.discountAmount, 0);
  assert.equal(rec.totalAmount, 65);
});

test('los ids de barra, servicio y retail sobreviven en productsSold', () => {
  const rec = buildDirectSaleRecord({
    ...ventaDeBarra,
    productsSold: [
      { productId: 'coffee:abc123', name: 'Latte', price: 55, qty: 2 },
      { productId: 'service:xyz', name: 'Limpieza', price: 800, qty: 1 },
      { productId: 'ckretail001', name: 'Sérum', price: 450, qty: 1, subtotal: 450 },
    ],
  }, FECHA);

  assert.deepEqual(rec.productsSold.map(p => p.productId), ['coffee:abc123', 'service:xyz', 'ckretail001']);
  assert.equal(rec.productsSold[0].subtotal, 110); // se calcula si no viene
  assert.equal(rec.productsAmount, 110 + 800 + 450);
});

test('el nombre de la clienta se conserva y hay respaldo si viene vacío', () => {
  assert.equal(buildDirectSaleRecord({ ...ventaDeBarra, clientName: '  Ana  ' }, FECHA).clientName, 'Ana');
  assert.equal(buildDirectSaleRecord({ ...ventaDeBarra, clientName: '' }, FECHA).clientName, 'Venta directa');
});

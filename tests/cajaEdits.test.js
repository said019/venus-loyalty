// tests/cajaEdits.test.js
// Run: node --test tests/cajaEdits.test.js
//
// Reglas de "corregir un cobro que se registró por accidente". Viven en un
// módulo puro para poder probarlas sin base de datos: el panel es un monolito
// sin tests, y el dinero es justo lo que no puede romperse en silencio.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  puedeEditarCaja,
  estadoAlDescobrar,
  parcheDescobrarCita,
  validarIngresoEditado,
  motivoBloqueoBorrado,
} from '../src/services/cajaEdits.js';

// ── Quién puede mover dinero ya registrado ───────────────────────────────
// Misma regla que ya rige en el resto del sistema: recepción cobra, pero no
// deshace (no puede cancelar citas pagadas ni aplicar descuentos).

test('solo admin puede editar o borrar un cobro', () => {
  assert.equal(puedeEditarCaja('admin'), true);
});

test('recepción no puede deshacer un cobro', () => {
  assert.equal(puedeEditarCaja('recepcion'), false);
});

test('marketing no puede deshacer un cobro', () => {
  assert.equal(puedeEditarCaja('marketing'), false);
});

test('un rol ausente no puede deshacer un cobro', () => {
  assert.equal(puedeEditarCaja(undefined), false);
});

// ── A qué estado regresa la cita al quitarle el cobro ────────────────────
// La cita NO se borra: sigue en la agenda y en Google Calendar, solo pierde
// el dinero y vuelve a la lista de "Pendientes de cobro".

test('una cita que estaba confirmada regresa a confirmada', () => {
  assert.equal(estadoAlDescobrar({ confirmedAt: new Date('2026-09-17T15:00:00Z') }), 'confirmed');
});

test('una cita que nunca se confirmó regresa a agendada', () => {
  assert.equal(estadoAlDescobrar({ confirmedAt: null }), 'scheduled');
});

// ── El parche que borra el cobro de la cita ──────────────────────────────

test('descobrar limpia TODOS los campos de dinero de la cita', () => {
  const cita = {
    status: 'completed',
    confirmedAt: new Date('2026-09-17T15:00:00Z'),
    totalPaid: 850,
    paymentMethod: 'tarjeta',
    discount: 100,
    productsSold: [{ name: 'Serum', quantity: 1 }],
    creditApplied: 300,
  };

  const parche = parcheDescobrarCita(cita);

  assert.equal(parche.status, 'confirmed');
  assert.equal(parche.totalPaid, null);
  assert.equal(parche.paymentMethod, null);
  assert.equal(parche.discount, null);
  assert.equal(parche.productsSold, null);
  assert.equal(parche.creditApplied, null);
});

test('no se puede descobrar una cita que nunca se cobró', () => {
  assert.throws(
    () => parcheDescobrarCita({ status: 'confirmed', totalPaid: null }),
    /no_estaba_cobrada/,
  );
});

test('una cita cobrada en $0 sí se puede descobrar', () => {
  // Cobrar en $0 es un caso real (cortesías): totalPaid es 0, no null, y ese
  // renglón también puede haberse registrado por accidente.
  const parche = parcheDescobrarCita({ status: 'completed', totalPaid: 0, confirmedAt: null });
  assert.equal(parche.status, 'scheduled');
  assert.equal(parche.totalPaid, null);
});

// ── Editar un ingreso sin cita (manual, paquete, venta de mostrador) ─────

test('un ingreso editado válido se normaliza', () => {
  const r = validarIngresoEditado({
    concept: '  Paquete 10 sesiones  ',
    clientName: '  Ana  ',
    amount: '1500.50',
    paymentMethod: 'transferencia',
    date: '2026-09-15',
  });

  assert.equal(r.ok, true);
  assert.equal(r.data.serviceName, 'Paquete 10 sesiones');
  assert.equal(r.data.clientName, 'Ana');
  assert.equal(r.data.total, 1500.5);
  assert.equal(r.data.totalAmount, 1500.5);
  assert.equal(r.data.subtotal, 1500.5);
  assert.equal(r.data.serviceAmount, 1500.5);
  assert.equal(r.data.paymentMethod, 'transferencia');
});

test('un ingreso sin concepto se rechaza', () => {
  const r = validarIngresoEditado({ concept: '   ', amount: 100, paymentMethod: 'efectivo' });
  assert.equal(r.ok, false);
  assert.match(r.error, /concepto/i);
});

test('un ingreso en cero o negativo se rechaza', () => {
  assert.equal(validarIngresoEditado({ concept: 'X', amount: 0, paymentMethod: 'efectivo' }).ok, false);
  assert.equal(validarIngresoEditado({ concept: 'X', amount: -50, paymentMethod: 'efectivo' }).ok, false);
});

test('un método de pago inventado se rechaza', () => {
  const r = validarIngresoEditado({ concept: 'X', amount: 100, paymentMethod: 'bitcoin' });
  assert.equal(r.ok, false);
  assert.match(r.error, /método/i);
});

test('sin fecha, el ingreso conserva la que ya tenía', () => {
  const r = validarIngresoEditado({ concept: 'X', amount: 100, paymentMethod: 'efectivo' });
  assert.equal(r.ok, true);
  assert.equal(r.data.date, undefined);
});

// ── Lo que NO se puede borrar desde la Caja ──────────────────────────────
// El dinero que una clienta dejó apartado vive como movimiento en su ficha.
// Borrar solo la venta dejaría el saldo vivo sin ingreso que lo respalde: se
// deshace desde la ficha, que sí devuelve las dos cosas a la vez.

test('un ingreso que es el depósito de un apartado no se borra desde Caja', () => {
  const motivo = motivoBloqueoBorrado({ id: 'venta1' }, { id: 'mov1', type: 'deposito', saleId: 'venta1' });
  assert.equal(motivo, 'apartado');
});

test('un ingreso normal sí se puede borrar', () => {
  assert.equal(motivoBloqueoBorrado({ id: 'venta1' }, null), null);
});

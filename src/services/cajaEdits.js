// src/services/cajaEdits.js
// Reglas para corregir un cobro que ya se registró: quién puede, qué pasa con
// la cita al quitarle el dinero, y qué NO se puede borrar desde la Caja.
//
// Vive aparte de server.js a propósito: son las decisiones que tocan dinero ya
// contado, y así se pueden probar sin base de datos (ver tests/cajaEdits.test.js).

export const METODOS_PAGO = ['efectivo', 'tarjeta', 'transferencia'];

// Recepción cobra, pero no deshace. Es la misma regla que ya rige en el resto
// del sistema: no puede cancelar citas pagadas ni aplicar descuentos.
export function puedeEditarCaja(role) {
  return role === 'admin';
}

// Al quitarle el cobro, la cita NO se borra: regresa al estado en el que
// estaba para volver a aparecer en "Pendientes de cobro".
export function estadoAlDescobrar(appointment) {
  return appointment && appointment.confirmedAt ? 'confirmed' : 'scheduled';
}

// El parche que le deja la cita sin un peso encima. Todo a null, no a 0: la
// Caja distingue "cobrada en $0" (cortesía) de "sin cobrar".
export function parcheDescobrarCita(appointment) {
  const cobrada = appointment
    && appointment.status === 'completed'
    && appointment.totalPaid !== null
    && appointment.totalPaid !== undefined;
  if (!cobrada) throw new Error('no_estaba_cobrada');

  return {
    status: estadoAlDescobrar(appointment),
    totalPaid: null,
    paymentMethod: null,
    discount: null,
    productsSold: null,
    creditApplied: null,
  };
}

// Valida la edición de un ingreso sin cita (manual, paquete, mostrador).
// Mismas reglas que al crearlo, para que corregir no pueda meter algo que
// nunca se habría podido registrar.
export function validarIngresoEditado(body) {
  const b = body || {};
  const concepto = String(b.concept || '').trim();
  if (!concepto) return { ok: false, error: 'Falta el concepto' };

  const monto = parseFloat(b.amount);
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'Monto inválido' };

  if (!METODOS_PAGO.includes(b.paymentMethod)) return { ok: false, error: 'Método de pago inválido' };

  const data = {
    serviceName: concepto,
    clientName: String(b.clientName || '').trim() || 'Ingreso manual',
    serviceAmount: monto,
    productsAmount: 0,
    subtotal: monto,
    total: monto,
    totalAmount: monto,
    paymentMethod: b.paymentMethod,
  };

  // Sin fecha nueva, el ingreso conserva la que ya tenía.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) {
    data.date = new Date(`${b.date}T12:00:00-06:00`);
  }

  return { ok: true, data };
}

// El dinero que una clienta dejó apartado vive como movimiento en su ficha, y
// ese movimiento apunta a su venta. Borrar solo la venta dejaría el saldo vivo
// sin ingreso que lo respalde: se deshace desde la ficha, que devuelve las dos
// cosas a la vez.
export function motivoBloqueoBorrado(sale, creditoLigado) {
  if (creditoLigado && creditoLigado.type === 'deposito' && creditoLigado.saleId === sale.id) {
    return 'apartado';
  }
  return null;
}

export const MENSAJES_BLOQUEO = {
  apartado: 'Ese ingreso es el apartado de una clienta. Deshazlo desde su ficha '
    + '(Saldo a favor → Deshacer): ahí se le quita el saldo y el ingreso al mismo tiempo.',
};

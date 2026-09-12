// Métodos de pago del panel admin — normalización y etiquetas.
// Script clásico: las funciones quedan globales igual que el resto del núcleo.
//
// Por qué existe: el mismo cobro se guarda con etiquetas distintas según de
// dónde venga. El modal de pago de citas y la Venta Rápida guardan
// "tarjeta_credito" / "tarjeta_debito"; el POS del café y el otro modal de
// cobro guardan "tarjeta". Los reportes comparaban con === 'tarjeta', así que
// esos cobros no caían en NINGUNA tarjeta del resumen por método: el total de
// ingresos era correcto pero Efectivo + Tarjeta + Transferencia sumaba menos.

// Devuelve siempre uno de: 'efectivo' | 'tarjeta' | 'transferencia'.
// Efectivo es el respaldo (es como se registraba antes lo desconocido).
function normalizarMetodoPago(metodo) {
  const m = String(metodo || '').toLowerCase();
  if (m.includes('tarjeta') || m === 'card') return 'tarjeta';
  if (m.includes('transfer')) return 'transferencia';
  return 'efectivo';
}

// Texto para mostrar: "tarjeta_credito" → "Tarjeta de crédito"
// (antes se imprimía crudo con la primera en mayúscula: "Tarjeta_credito").
function etiquetaMetodoPago(metodo) {
  const m = String(metodo || '').toLowerCase();
  if (m === 'tarjeta_credito') return 'Tarjeta de crédito';
  if (m === 'tarjeta_debito') return 'Tarjeta de débito';
  return { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' }[normalizarMetodoPago(m)];
}

// ¿A qué cuenta entra el dinero? Todo lo que no es efectivo cae en banco.
function cuentaDeMetodoPago(metodo, nombreBanco = 'BBVA Aho') {
  return normalizarMetodoPago(metodo) === 'efectivo' ? 'Caja' : nombreBanco;
}

window.normalizarMetodoPago = normalizarMetodoPago;
window.etiquetaMetodoPago = etiquetaMetodoPago;
window.cuentaDeMetodoPago = cuentaDeMetodoPago;

// Superficie para pruebas (mismo patrón que router.js)
window.__adminPagos = { normalizarMetodoPago, etiquetaMetodoPago, cuentaDeMetodoPago };

// Venta Rápida ("Nueva venta") — armado del registro de venta directa.
//
// Bug real (jul-2026): el endpoint POST /api/direct-sales escribía la venta con
// `firestore.collection('sales').add({ type: 'direct', ... })`. La capa compat
// traduce eso a `prisma.sale.create()`, y el modelo Sale NUNCA tuvo la columna
// `type` ni recibía `total`/`date` (ambos obligatorios) → Prisma tronaba con
// "Unknown argument `type`" y TODA venta directa devolvía
// { success:false, error:... }: con descuento y sin descuento, con producto de
// barra (café) o de retail. Nada se guardaba.
//
// Aquí se arma el registro en un módulo puro y testeable: solo campos que el
// modelo Prisma Sale conoce, con los importes ya normalizados a número.

/**
 * Campos que SalesRepo.create() sabe traducir al modelo Prisma `Sale`.
 * Cualquier llave fuera de esta lista revienta el create con "Unknown argument".
 */
export const DIRECT_SALE_FIELDS = [
  'appointmentId',
  'clientName',
  'serviceName',
  'serviceAmount',
  'productsAmount',
  'subtotal',
  'discountType',
  'discountValue',
  'discountAmount',
  'totalAmount',
  'productsSold',
  'paymentMethod',
  'date',
];

const TIPOS_DESCUENTO = ['percent', 'fixed'];

function num(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza un item del carrito de Venta Rápida.
 * Los ids pueden ser de retail (cuid), de servicio ("service:…") o de barra
 * ("coffee:…" / "coffee:…:variante"); todos se guardan tal cual en el JSON.
 */
function normalizeItem(item) {
  const qty = Math.max(1, parseInt(item?.qty, 10) || 1);
  const price = num(item?.price);
  return {
    productId: item?.productId != null ? String(item.productId) : null,
    name: item?.name ? String(item.name) : 'Producto',
    price,
    qty,
    subtotal: item?.subtotal != null ? num(item.subtotal) : price * qty,
  };
}

/**
 * Arma el registro para SalesRepo.create() a partir del body de
 * POST /api/direct-sales. Recalcula descuento y total desde los items para no
 * confiar en los importes que manda el navegador.
 *
 * @param {object} body payload de la Venta Rápida
 * @param {Date} [now] fecha de la venta (inyectable para tests)
 */
export function buildDirectSaleRecord(body = {}, now = new Date()) {
  const items = Array.isArray(body.productsSold) ? body.productsSold.map(normalizeItem) : [];
  const productsAmount = items.reduce((sum, p) => sum + p.subtotal, 0);

  const discountType = TIPOS_DESCUENTO.includes(body.discountType) ? body.discountType : null;
  const discountValue = discountType ? Math.max(0, num(body.discountValue)) : 0;

  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = Math.round(productsAmount * (Math.min(discountValue, 100) / 100));
  } else if (discountType === 'fixed') {
    discountAmount = Math.min(discountValue, productsAmount);
  }

  const totalAmount = Math.max(0, productsAmount - discountAmount);

  return {
    appointmentId: null, // venta sin cita: así la distinguen los reportes
    clientName: (body.clientName && String(body.clientName).trim()) || 'Venta directa',
    serviceName: null, // sin servicio: marca la venta como directa (antes: type:'direct')
    serviceAmount: 0,
    productsAmount,
    subtotal: productsAmount,
    discountType: discountAmount > 0 ? discountType : null,
    discountValue: discountAmount > 0 ? discountValue : 0,
    discountAmount,
    totalAmount,
    productsSold: items,
    paymentMethod: body.paymentMethod || 'efectivo',
    date: now,
  };
}

export default buildDirectSaleRecord;

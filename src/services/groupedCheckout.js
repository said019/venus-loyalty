import { mismoTelefono } from '../utils/phone.js';

const fail = message => { throw Object.assign(new Error(message), { checkout: true }); };
export const unpaid = a => ['scheduled', 'confirmed', 'completed'].includes(a.status) && a.totalPaid == null && !Number(a.creditApplied);
export function sameClient(a, b) {
  if (a.cardId && b.cardId) return a.cardId === b.cardId;
  return mismoTelefono(a.clientPhone, b.clientPhone);
}
export function cents(value) {
  const n = Number(value);
  if (value == null || value === '' || typeof value === 'boolean' || !Number.isFinite(n) || n < 0 || n > 9999999) fail('Monto inválido');
  return Math.round(n * 100);
}
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  let consumed = 0, prior = 0;
  return weights.map(w => { consumed += w; const next = Math.round(total * consumed / sum); const part = next - prior; prior = next; return part; });
}
export async function checkoutGroup(prisma, anchorId, body, actor) {
  if (!['admin', 'staff', 'recepcion'].includes(actor?.role)) fail('No autorizado');
  const items = body.groupItems;
  if (!Array.isArray(items) || items.length < 2 || items.length > 20 || items[0]?.id !== anchorId || new Set(items.map(i => i.id)).size !== items.length) fail('Grupo de citas inválido');
  if (!['efectivo', 'tarjeta', 'transferencia'].includes(body.paymentMethod)) fail('Método de pago inválido');
  const discount = cents(body.discount ?? 0), credit = cents(body.creditApplied ?? 0), paid = cents(body.totalPaid);
  if (actor.role === 'recepcion' && (discount || Number(body.discountAmount) > 0 || Number(body.discountValue) > 0 || body.discountType)) fail('Recepción no puede aplicar descuentos');
  const products = body.productsSold || [];
  if (!Array.isArray(products) || products.length > 100) fail('Productos inválidos');
  let productTotal = 0;
  for (const p of products) {
    if (!Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 1000) fail('Cantidad inválida');
    const line = cents(p.price) * p.quantity;
    if (line !== cents(p.subtotal)) fail('Importe de producto inválido');
    productTotal += line;
  }
  const prices = items.map(i => cents(i.price));
  const weights = prices.map((v, i) => v + (i === 0 ? productTotal : 0));
  const subtotal = weights.reduce((a, b) => a + b, 0);
  if (discount + credit > subtotal || paid !== subtotal - discount - credit) fail('El total cambió; revisa el cobro');
  const discounts = allocate(discount, weights);
  const credits = allocate(credit, weights.map((v, i) => v - discounts[i]));
  return prisma.$transaction(async tx => {
    const rows = await tx.appointment.findMany({ where: { id: { in: items.map(i => i.id) } } });
    const anchor = rows.find(r => r.id === anchorId);
    if (new Set(rows.map(r => r.cardId).filter(Boolean)).size > 1) fail('Las citas tienen tarjetas distintas');
    if (!anchor || rows.length !== items.length || rows.some(r => !unpaid(r) || r.date !== anchor.date || !sameClient(anchor, r))) fail('Las citas deben estar pendientes y ser de la misma clienta y fecha');
    for (const item of items) {
      const row = rows.find(r => r.id === item.id);
      if (!item.version || new Date(row.updatedAt).toISOString() !== item.version) fail('Una cita cambió; vuelve a abrir el cobro');
    }
    let card;
    if (credit) {
      card = anchor.cardId ? await tx.card.findUnique({ where: { id: anchor.cardId } }) : await tx.card.findFirst({ where: { phone: anchor.clientPhone } });
      if (!card) fail('No se encontró la tarjeta para aplicar el apartado');
      const balance = await tx.clientCredit.aggregate({ where: { cardId: card.id, revertedAt: null }, _sum: { amount: true } });
      if (Math.round(Number(balance._sum.amount || 0) * 100) < credit) fail('Saldo apartado insuficiente');
    }
    for (let i = 0; i < items.length; i++) {
      const row = rows.find(r => r.id === items[i].id), net = weights[i] - discounts[i] - credits[i];
      const serviceName = i === 0 && body.serviceName ? String(body.serviceName).trim() : row.serviceName;
      const changed = await tx.appointment.updateMany({ where: { id: row.id, updatedAt: row.updatedAt, totalPaid: null }, data: {
        status: 'completed', totalPaid: net / 100, paymentMethod: body.paymentMethod,
        discount: discounts[i] / 100, creditApplied: credits[i] / 100,
        productsSold: i === 0 ? products : [], serviceName,
        ...(i === 0 && body.serviceId ? { serviceId: String(body.serviceId) } : {}),
      } });
      if (changed.count !== 1) fail('Una cita ya fue cobrada; actualiza la caja');
      if (credits[i]) await tx.clientCredit.create({ data: { cardId: card.id, clientPhone: card.phone, type: 'aplicacion', amount: -credits[i] / 100, appointmentId: row.id, sourceRef: 'appt:' + row.id, createdBy: actor.email || actor.role, note: 'Cobro conjunto del día' } });
      await tx.sale.deleteMany({ where: { appointmentId: row.id } });
      await tx.sale.create({ data: { appointmentId: row.id, clientName: row.clientName, clientPhone: row.clientPhone, serviceName,
        serviceAmount: prices[i] / 100, productsAmount: i === 0 ? productTotal / 100 : 0,
        subtotal: weights[i] / 100, discountAmount: discounts[i] / 100, total: net / 100, totalAmount: net / 100,
        paymentMethod: body.paymentMethod, productsSold: i === 0 ? products : [], date: new Date() } });
    }
    return { appointmentIds: items.map(i => i.id), totalPaid: paid / 100 };
  }, { isolationLevel: 'Serializable' });
}

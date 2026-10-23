export function inventoryError(message, status = 400) {
  const error = new Error(message); error.inventory = true; error.status = status; return error;
}
export function milliMl(value, { zero = false } = {}) {
  const str = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,3})?$/.test(str)) throw inventoryError('Usa ml positivos con un máximo de 3 decimales.');
  const n = Math.round(Number(str) * 1000);
  if (!Number.isSafeInteger(n) || n > 1_000_000_000 || n < (zero ? 0 : 1)) throw inventoryError('Cantidad de ml fuera de rango.');
  return n;
}
export function requestKey(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(value)) throw inventoryError('Falta la referencia del movimiento. Recarga la página.');
  return value;
}
export function cleanNote(value, required = false) {
  const note = String(value || '').trim();
  if (note.length > 500 || (required && !note)) throw inventoryError('Escribe un motivo de hasta 500 caracteres.');
  return note;
}
export function normalizeUsage(items, noProducts) {
  if (!Array.isArray(items) || items.length > 100) throw inventoryError('Revisa los productos utilizados.');
  if (!items.length && noProducts !== true) throw inventoryError('Agrega un producto o indica que no usaste productos.');
  if (items.length && noProducts) throw inventoryError('Revisa la selección de productos.');
  const ids = new Set();
  return items.map(item => {
    if (typeof item.supplyId !== 'string' || !item.supplyId || ids.has(item.supplyId)) throw inventoryError('Selecciona cada producto una sola vez.');
    ids.add(item.supplyId);
    return { supplyId: item.supplyId, milliMl: milliMl(item.ml) };
  }).sort((a, b) => a.supplyId.localeCompare(b.supplyId));
}
// Todos los descuentos se condicionan al saldo vigente dentro de la misma
// transacción que guarda la bitácora; dos sesiones no pueden gastar el mismo ml.
export async function moveStock(tx, supplyId, delta, data) {
  const where = { id: supplyId, ...(delta < 0 ? { stockMilliMl: { gte: -delta } } : { stockMilliMl: { lte: 2_000_000_000 - delta } }) };
  const result = await tx.clinicSupply.updateMany({ where, data: { stockMilliMl: { increment: delta } } });
  if (result.count !== 1) throw inventoryError('Stock insuficiente o producto no disponible. Actualiza las cantidades.', 409);
  const supply = await tx.clinicSupply.findUnique({ where: { id: supplyId } });
  await tx.clinicStockMovement.create({ data: { ...data, supplyId, deltaMilliMl: delta, stockAfterMilliMl: supply.stockMilliMl } });
  return supply;
}
export async function saveUsage(db, appointmentId, body, actor, canEdit, assignedAdminId = null) {
  const key = requestKey(body.requestKey);
  const items = normalizeUsage(body.items, body.noProducts);
  const note = cleanNote(body.note);
  const revision = Number(body.revision ?? 0);
  if (!Number.isInteger(revision) || revision < 0) throw inventoryError('Versión de consumo inválida.');
  try {
    return await db.$transaction(async tx => {
      if (assignedAdminId) {
        const allowed = await tx.appointment.updateMany({
          where: { id: appointmentId, assignedAdminId, status: { in: ['scheduled', 'confirmed', 'completed'] } },
          data: { status: 'completed' }
        });
        if (allowed.count !== 1) throw inventoryError('Solo puedes completar tus citas asignadas y activas.', 403);
      }
      const previous = await tx.clinicUsage.findUnique({ where: { appointmentId } });
      if (previous?.requestKey === key) return previous;
      if (previous && !canEdit) throw inventoryError('Solo administración puede corregir un consumo guardado.', 403);
      if ((previous?.revision || 0) !== revision) throw inventoryError('Otra persona actualizó el consumo. Ciérralo y vuelve a abrirlo.', 409);
      const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!appointment || appointment.status !== 'completed') throw inventoryError('Primero completa el servicio.', 409);
      const supplies = await tx.clinicSupply.findMany({ where: { id: { in: items.map(i => i.supplyId) } } });
      if (supplies.length !== items.length) throw inventoryError('Uno de los productos ya no está disponible.');
      const stored = items.map(i => ({ ...i, name: supplies.find(s => s.id === i.supplyId).name }));
      const data = { items: stored, note, clientName: appointment.clientName, serviceName: appointment.serviceName, requestKey: key, createdBy: actor };
      let usage;
      if (previous) {
        const changed = await tx.clinicUsage.updateMany({ where: { appointmentId, revision }, data: { ...data, revision: { increment: 1 } } });
        if (changed.count !== 1) throw inventoryError('El consumo cambió en otra sesión. Vuelve a abrirlo.', 409);
        usage = await tx.clinicUsage.findUnique({ where: { appointmentId } });
      } else usage = await tx.clinicUsage.create({ data: { ...data, appointmentId } });
      const oldItems = previous?.items || [];
      const allIds = [...new Set([...oldItems, ...items].map(i => i.supplyId))].sort();
      for (const supplyId of allIds) {
        const delta = (oldItems.find(i => i.supplyId === supplyId)?.milliMl || 0) - (items.find(i => i.supplyId === supplyId)?.milliMl || 0);
        if (delta) await moveStock(tx, supplyId, delta, { kind: previous ? 'correction' : 'usage', note: note || `${appointment.clientName} · ${appointment.serviceName}`, appointmentId, requestKey: key, createdBy: actor });
      }
      return usage;
    });
  } catch (error) {
    if (['P2002', 'P2034'].includes(error.code)) {
      const saved = await db.clinicUsage.findUnique({ where: { appointmentId } });
      if (saved?.requestKey === key) return saved;
      throw inventoryError('El inventario cambió en otra sesión. Vuelve a abrir el consumo.', 409);
    }
    throw error;
  }
}

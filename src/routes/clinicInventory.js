import express from 'express';
import { prisma } from '../db/index.js';
import { adminAuth, requireRole } from '../../lib/auth.js';
import { cleanNote, inventoryError, milliMl, moveStock, requestKey, saveUsage } from '../services/clinicInventory.js';
const router = express.Router();
router.use(adminAuth, requireRole('admin', 'recepcion'));
const actor = req => req.admin.email || req.admin.uid || req.admin.role;
const run = fn => async (req, res) => {
  try { res.json({ success: true, data: await fn(req) }); }
  catch (error) {
    console.error('[Clinic inventory]', error.message);
    const conflict = ['P2002', 'P2034'].includes(error.code);
    res.status(error.inventory ? error.status : conflict ? 409 : 500).json({ success: false, error: error.inventory ? error.message : conflict ? 'El inventario cambió. Actualiza la página e intenta de nuevo.' : 'No se pudo guardar o cargar el inventario. Intenta de nuevo.' });
  }
};
router.get('/', run(async () => prisma.clinicSupply.findMany({ orderBy: { name: 'asc' } })));
router.post('/', requireRole('admin'), run(async req => {
  const id = requestKey(req.body.requestKey);
  const name = String(req.body.name || '').trim();
  if (!name || name.length > 150) throw inventoryError('Escribe un nombre de hasta 150 caracteres.');
  const bottleMilliMl = milliMl(req.body.bottleMl);
  const initial = milliMl(req.body.stockMl, { zero: true });
  const minMilliMl = milliMl(req.body.minMl, { zero: true });
  const existing = await prisma.clinicSupply.findUnique({ where: { id } });
  if (existing) return existing;
  try {
    return await prisma.$transaction(async tx => {
      await tx.clinicSupply.create({ data: { id, name, bottleMilliMl, minMilliMl } });
      return moveStock(tx, id, initial, { kind: 'initial', note: 'Existencia inicial del consultorio', requestKey: id, createdBy: actor(req) });
    });
  } catch (error) {
    if (error.code === 'P2002') { const saved = await prisma.clinicSupply.findUnique({ where: { id } }); if (saved) return saved; }
    throw error;
  }
}));
router.post('/:id/stock', requireRole('admin'), run(async req => {
  const key = requestKey(req.body.requestKey);
  const note = cleanNote(req.body.note, true);
  if (!['entry', 'adjustment', 'transfer'].includes(req.body.kind)) throw inventoryError('Tipo de movimiento inválido.');
  try {
    return await prisma.$transaction(async tx => {
      const existing = await tx.clinicStockMovement.findUnique({ where: { requestKey_supplyId: { requestKey: key, supplyId: req.params.id } } });
      if (existing) return existing;
      const supply = await tx.clinicSupply.findUnique({ where: { id: req.params.id } });
      if (!supply) throw inventoryError('Producto no encontrado.', 404);
      let delta, sourceProductId;
      if (req.body.kind === 'transfer') {
        const bottles = Number(req.body.bottles);
        sourceProductId = req.body.sourceProductId;
        if (!Number.isInteger(bottles) || bottles < 1 || bottles > 10000 || typeof sourceProductId !== 'string') throw inventoryError('Selecciona el producto de venta y el número de frascos completos.');
        delta = supply.bottleMilliMl * bottles;
        if (delta > 1_000_000_000) throw inventoryError('Cantidad demasiado grande.');
        const changed = await tx.product.updateMany({ where: { id: sourceProductId, stock: { gte: bottles } }, data: { stock: { decrement: bottles } } });
        if (changed.count !== 1) throw inventoryError('No hay suficientes unidades en el inventario de venta.', 409);
      } else {
        delta = milliMl(req.body.ml);
        if (req.body.kind === 'adjustment') {
          if (!['add', 'subtract'].includes(req.body.direction)) throw inventoryError('Selecciona si vas a sumar o restar ml.');
          if (req.body.direction === 'subtract') delta = -delta;
        }
      }
      return moveStock(tx, supply.id, delta, { kind: req.body.kind, note, sourceProductId, requestKey: key, createdBy: actor(req) });
    });
  } catch (error) {
    if (error.code === 'P2002') {
      const saved = await prisma.clinicStockMovement.findUnique({ where: { requestKey_supplyId: { requestKey: key, supplyId: req.params.id } } });
      if (saved) return saved;
    }
    throw error;
  }
}));
router.get('/activity', run(async req => {
  const skip = Math.max(0, Math.min(100000, Number(req.query.offset) || 0));
  return prisma.clinicStockMovement.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, skip: Math.floor(skip), include: { supply: { select: { name: true } } } });
}));
router.get('/pending', run(async () => {
  // Fecha de activación persistida por la migración. También conserva los
  // servicios pospuestos antes de registrar el primer frasco.
  const activation = await prisma.setting.findUnique({ where: { key: 'clinic_inventory_started_at' } });
  const startedAt = new Date(activation?.value || '2026-10-20T06:00:00.000Z');
  const registered = await prisma.clinicUsage.findMany({ select: { appointmentId: true } });
  return prisma.appointment.findMany({ where: { status: 'completed', updatedAt: { gte: startedAt }, id: { notIn: registered.map(u => u.appointmentId) } }, orderBy: { updatedAt: 'desc' }, select: { id: true, clientName: true, serviceName: true, date: true } });
}));
router.get('/usage/:appointmentId', run(async req => {
  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.appointmentId }, select: { id: true, clientName: true, serviceName: true, status: true } });
  if (!appointment) throw inventoryError('Cita no encontrada.', 404);
  const usage = await prisma.clinicUsage.findUnique({ where: { appointmentId: appointment.id } });
  return { appointment, usage };
}));
router.put('/usage/:appointmentId', run(req => saveUsage(prisma, req.params.appointmentId, req.body, actor(req), req.admin.role === 'admin')));
router.get('/usages', run(async req => {
  const skip = Math.max(0, Math.min(100000, Number(req.query.offset) || 0));
  return prisma.clinicUsage.findMany({ orderBy: { updatedAt: 'desc' }, take: 50, skip: Math.floor(skip) });
}));
export default router;

// Paquetes de sesiones (láser, faciales, corporales).
// El catálogo vendía "paquetes" como texto en la descripción del servicio
// ("Paquete 10 sesiones $3000") sin control de saldo: el conteo vivía en la
// cabeza de la dueña — fuente #1 de conflictos con clientas. Aquí vive el
// catálogo de paquetes, la venta a una clienta y el descuento de sesiones.

import express from 'express';
import { prisma } from '../db/index.js';
import { adminAuth, requireRole } from '../../lib/auth.js';

const router = express.Router();
router.use(adminAuth);

const fail = (res, code, error) => res.status(code).json({ success: false, error });

// Deriva el estado real de una compra al momento de leerla (el status
// guardado puede quedar viejo si la vigencia venció sin que nadie tocara
// la fila; nunca se confía solo en la columna).
function estadoVivo(cp) {
  if (cp.status === 'cancelled') return 'cancelled';
  if (cp.sessionsUsed >= cp.sessionsTotal) return 'exhausted';
  if (cp.expiresAt && new Date(cp.expiresAt) < new Date()) return 'expired';
  return 'active';
}

function serializar(cp) {
  return {
    id: cp.id,
    cardId: cp.cardId,
    packageId: cp.packageId,
    packageName: cp.package ? cp.package.name : undefined,
    serviceName: cp.package ? cp.package.serviceName : undefined,
    sessionsTotal: cp.sessionsTotal,
    sessionsUsed: cp.sessionsUsed,
    sessionsRemaining: Math.max(0, cp.sessionsTotal - cp.sessionsUsed),
    pricePaid: Number(cp.pricePaid),
    paymentMethod: cp.paymentMethod,
    purchasedAt: cp.purchasedAt,
    expiresAt: cp.expiresAt,
    status: estadoVivo(cp),
    uses: (cp.uses || []).map(u => ({ id: u.id, usedAt: u.usedAt, by: u.by, note: u.note, appointmentId: u.appointmentId })),
  };
}

// ── Catálogo ─────────────────────────────────────────────────────────────

// GET /api/packages — catálogo (?all=1 incluye desactivados, para el admin)
router.get('/', async (req, res) => {
  try {
    const where = req.query.all === '1' ? {} : { isActive: true };
    const rows = await prisma.sessionPackage.findMany({ where, orderBy: { name: 'asc' } });
    res.json({ success: true, data: rows.map(p => ({ ...p, price: Number(p.price) })) });
  } catch (e) { console.error('[PACKAGES GET]', e); return fail(res, 500, e.message); }
});

// POST /api/packages — crear
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, serviceName, sessionsTotal, price, validityDays } = req.body || {};
    const total = parseInt(sessionsTotal, 10);
    const precio = parseFloat(price);
    if (!name || !String(name).trim()) return fail(res, 400, 'Falta el nombre');
    if (!Number.isFinite(total) || total < 1) return fail(res, 400, 'Sesiones inválidas');
    if (!Number.isFinite(precio) || precio < 0) return fail(res, 400, 'Precio inválido');
    const vig = validityDays ? parseInt(validityDays, 10) : null;
    const row = await prisma.sessionPackage.create({
      data: { name: String(name).trim(), serviceName: serviceName || null, sessionsTotal: total, price: precio, validityDays: Number.isFinite(vig) && vig > 0 ? vig : null },
    });
    console.log(`[PACKAGES] Creado: ${row.name} (${total} sesiones · $${precio})`);
    res.json({ success: true, data: row });
  } catch (e) { console.error('[PACKAGES POST]', e); return fail(res, 500, e.message); }
});

// PUT /api/packages/:id — editar / activar / desactivar
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, serviceName, sessionsTotal, price, validityDays, isActive } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (serviceName !== undefined) data.serviceName = serviceName || null;
    if (sessionsTotal !== undefined) data.sessionsTotal = parseInt(sessionsTotal, 10);
    if (price !== undefined) data.price = parseFloat(price);
    if (validityDays !== undefined) { const v = parseInt(validityDays, 10); data.validityDays = Number.isFinite(v) && v > 0 ? v : null; }
    if (isActive !== undefined) data.isActive = isActive === true;
    const row = await prisma.sessionPackage.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: row });
  } catch (e) { console.error('[PACKAGES PUT]', e); return fail(res, 500, e.message); }
});

// ── Compras de clienta ───────────────────────────────────────────────────

// GET /api/packages/card/:cardId — saldos de una clienta
router.get('/card/:cardId', async (req, res) => {
  try {
    const rows = await prisma.clientPackage.findMany({
      where: { cardId: req.params.cardId },
      include: { package: true, uses: { orderBy: { usedAt: 'desc' } } },
      orderBy: { purchasedAt: 'desc' },
    });
    res.json({ success: true, data: rows.map(serializar) });
  } catch (e) { console.error('[PACKAGES CARD]', e); return fail(res, 500, e.message); }
});

// POST /api/packages/card/:cardId/sell — vender un paquete a la clienta.
// Registra también la venta en `sales` para que el dinero aparezca en
// Reportes al instante (misma tercera fuente que los ingresos manuales).
router.post('/card/:cardId/sell', async (req, res) => {
  try {
    const { packageId, paymentMethod, pricePaid } = req.body || {};
    if (!['efectivo', 'tarjeta', 'transferencia'].includes(paymentMethod)) {
      return fail(res, 400, 'Método de pago inválido');
    }
    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    if (!card) return fail(res, 404, 'Clienta no encontrada');
    const pack = await prisma.sessionPackage.findUnique({ where: { id: packageId } });
    if (!pack || !pack.isActive) return fail(res, 404, 'Paquete no encontrado o inactivo');

    const monto = pricePaid !== undefined && pricePaid !== null && pricePaid !== ''
      ? parseFloat(pricePaid) : Number(pack.price);
    if (!Number.isFinite(monto) || monto < 0) return fail(res, 400, 'Monto inválido');

    const expiresAt = pack.validityDays
      ? new Date(Date.now() + pack.validityDays * 24 * 60 * 60 * 1000)
      : null;

    const compra = await prisma.clientPackage.create({
      data: {
        cardId: card.id,
        packageId: pack.id,
        sessionsTotal: pack.sessionsTotal,
        pricePaid: monto,
        paymentMethod,
        expiresAt,
      },
      include: { package: true, uses: true },
    });

    await prisma.sale.create({
      data: {
        clientName: card.name,
        clientPhone: card.phone,
        serviceName: pack.name,
        serviceAmount: monto,
        productsAmount: 0,
        subtotal: monto,
        total: monto,
        totalAmount: monto,
        paymentMethod,
        date: new Date(),
      },
    });

    console.log(`[PACKAGES] Vendido "${pack.name}" a ${card.name} · $${monto} · ${paymentMethod}`);
    res.json({ success: true, data: serializar(compra) });
  } catch (e) { console.error('[PACKAGES SELL]', e); return fail(res, 500, e.message); }
});

// POST /api/packages/purchase/:id/use — descontar 1 sesión.
// Transacción con guardas: nunca deja el saldo en negativo ni descuenta de
// un paquete vencido/cancelado.
router.post('/purchase/:id/use', async (req, res) => {
  try {
    const { note, appointmentId } = req.body || {};
    const quien = (req.admin && (req.admin.email || req.admin.role)) || 'admin';

    const resultado = await prisma.$transaction(async (tx) => {
      const cp = await tx.clientPackage.findUnique({ where: { id: req.params.id }, include: { package: true } });
      if (!cp) throw new Error('compra_no_encontrada');
      const estado = estadoVivo(cp);
      if (estado === 'exhausted') throw new Error('sin_sesiones');
      if (estado === 'expired') throw new Error('paquete_vencido');
      if (estado === 'cancelled') throw new Error('paquete_cancelado');

      await tx.packageUse.create({
        data: { clientPackageId: cp.id, by: quien, note: note || null, appointmentId: appointmentId || null },
      });
      const usado = cp.sessionsUsed + 1;
      return tx.clientPackage.update({
        where: { id: cp.id },
        data: { sessionsUsed: usado, status: usado >= cp.sessionsTotal ? 'exhausted' : 'active' },
        include: { package: true, uses: { orderBy: { usedAt: 'desc' } } },
      });
    });

    console.log(`[PACKAGES] Sesión descontada: ${resultado.package.name} → ${resultado.sessionsUsed}/${resultado.sessionsTotal}`);
    res.json({ success: true, data: serializar(resultado) });
  } catch (e) {
    const conocidos = { compra_no_encontrada: 404, sin_sesiones: 409, paquete_vencido: 409, paquete_cancelado: 409 };
    if (conocidos[e.message]) return fail(res, conocidos[e.message], e.message);
    console.error('[PACKAGES USE]', e); return fail(res, 500, e.message);
  }
});

// POST /api/packages/purchase/:id/revert-use — deshacer el último descuento
// (dedazo de recepción). Borra el uso más reciente y regresa la sesión.
router.post('/purchase/:id/revert-use', async (req, res) => {
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const cp = await tx.clientPackage.findUnique({ where: { id: req.params.id } });
      if (!cp) throw new Error('compra_no_encontrada');
      if (cp.sessionsUsed <= 0) throw new Error('nada_que_deshacer');
      const ultimo = await tx.packageUse.findFirst({ where: { clientPackageId: cp.id }, orderBy: { usedAt: 'desc' } });
      if (ultimo) await tx.packageUse.delete({ where: { id: ultimo.id } });
      return tx.clientPackage.update({
        where: { id: cp.id },
        data: { sessionsUsed: cp.sessionsUsed - 1, status: 'active' },
        include: { package: true, uses: { orderBy: { usedAt: 'desc' } } },
      });
    });
    console.log(`[PACKAGES] Descuento revertido → ${resultado.sessionsUsed}/${resultado.sessionsTotal}`);
    res.json({ success: true, data: serializar(resultado) });
  } catch (e) {
    const conocidos = { compra_no_encontrada: 404, nada_que_deshacer: 409 };
    if (conocidos[e.message]) return fail(res, conocidos[e.message], e.message);
    console.error('[PACKAGES REVERT]', e); return fail(res, 500, e.message);
  }
});

export default router;

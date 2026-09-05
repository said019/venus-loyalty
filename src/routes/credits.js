// Apartados (saldo a favor de la clienta).
// "Déjame $500 apartados para mi facial de octubre." Antes ese dinero vivía
// en un cuaderno y en la memoria de la dueña. Aquí vive la bitácora: cada
// movimiento es un renglón (depósito, aplicación, devolución) y el saldo se
// calcula sumando — nunca un número guardado que se pueda desincronizar.
//
// Criterio contable (decidido con la dueña): el dinero cuenta como ingreso
// EL DÍA QUE LA CLIENTA LO DEJA, no el día de la cita. Así el reporte de
// cada día cuadra con lo que de verdad hay en la caja, y es el mismo
// criterio que ya usan los paquetes de sesiones.

import express from 'express';
import { prisma } from '../db/index.js';
import { adminAuth, requireRole } from '../../lib/auth.js';

const router = express.Router();
router.use(adminAuth);

const fail = (res, code, error) => res.status(code).json({ success: false, error });
const METODOS = ['efectivo', 'tarjeta', 'transferencia'];

// Redondeo a centavos: sumar decimales en JS deja saldos tipo 0.000000001
// que luego bloquean un "aplicar todo" por un centavo fantasma.
const centavos = (n) => Math.round((Number(n) || 0) * 100) / 100;

// El saldo SIEMPRE se deriva de la bitácora, nunca se lee de una columna.
// Recibe tx para poder llamarse dentro de una transacción.
async function saldoDe(tx, cardId) {
  const r = await tx.clientCredit.aggregate({
    where: { cardId, revertedAt: null },
    _sum: { amount: true },
  });
  return centavos(r._sum.amount || 0);
}

function serializar(m) {
  return {
    id: m.id,
    type: m.type,
    amount: Number(m.amount),
    paymentMethod: m.paymentMethod,
    appointmentId: m.appointmentId,
    note: m.note,
    createdBy: m.createdBy,
    createdAt: m.createdAt,
    reverted: !!m.revertedAt,
    revertedAt: m.revertedAt,
  };
}

const quienEs = (req) => (req.admin && (req.admin.email || req.admin.role)) || 'admin';

// Resuelve la clienta por id de tarjeta o, si no hay, por teléfono (las citas
// viejas traen teléfono pero no cardId).
async function resolverCard({ cardId, clientPhone }) {
  if (cardId) {
    const c = await prisma.card.findUnique({ where: { id: cardId } });
    if (c) return c;
  }
  if (clientPhone) {
    return prisma.card.findFirst({ where: { phone: String(clientPhone) } });
  }
  return null;
}

// ── Consulta ─────────────────────────────────────────────────────────────

// GET /api/credits/card/:cardId — saldo + movimientos de una clienta
router.get('/card/:cardId', async (req, res) => {
  try {
    const movimientos = await prisma.clientCredit.findMany({
      where: { cardId: req.params.cardId },
      orderBy: { createdAt: 'desc' },
    });
    const balance = centavos(
      movimientos.filter(m => !m.revertedAt).reduce((s, m) => s + Number(m.amount), 0)
    );
    res.json({ success: true, data: { balance, movements: movimientos.map(serializar) } });
  } catch (e) { console.error('[CREDITS CARD]', e); return fail(res, 500, e.message); }
});

// GET /api/credits/lookup?cardId=&phone= — saldo de una clienta cuando el
// que pregunta es el cobro de cita: las citas viejas traen teléfono pero no
// cardId, así que acepta cualquiera de los dos.
router.get('/lookup', async (req, res) => {
  try {
    const card = await resolverCard({ cardId: req.query.cardId, clientPhone: req.query.phone });
    if (!card) return res.json({ success: true, data: { balance: 0, cardId: null } });
    const balance = await saldoDe(prisma, card.id);
    res.json({ success: true, data: { balance, cardId: card.id, name: card.name } });
  } catch (e) { console.error('[CREDITS LOOKUP]', e); return fail(res, 500, e.message); }
});

// GET /api/credits/pending — clientas con saldo sin usar.
// Es dinero que ya entró a la caja pero que todavía le pertenece a ellas:
// la dueña necesita verlo de un vistazo en Reportes.
router.get('/pending', async (req, res) => {
  try {
    const grupos = await prisma.clientCredit.groupBy({
      by: ['cardId'],
      where: { revertedAt: null },
      _sum: { amount: true },
    });
    const conSaldo = grupos
      .map(g => ({ cardId: g.cardId, balance: centavos(g._sum.amount || 0) }))
      .filter(g => g.balance > 0.005)
      .sort((a, b) => b.balance - a.balance);

    if (!conSaldo.length) return res.json({ success: true, data: { total: 0, clientas: [] } });

    const cards = await prisma.card.findMany({
      where: { id: { in: conSaldo.map(c => c.cardId) } },
      select: { id: true, name: true, phone: true },
    });
    const porId = new Map(cards.map(c => [c.id, c]));

    res.json({
      success: true,
      data: {
        total: centavos(conSaldo.reduce((s, c) => s + c.balance, 0)),
        clientas: conSaldo.map(c => ({
          cardId: c.cardId,
          balance: c.balance,
          name: porId.get(c.cardId)?.name || 'Clienta',
          phone: porId.get(c.cardId)?.phone || null,
        })),
      },
    });
  } catch (e) { console.error('[CREDITS PENDING]', e); return fail(res, 500, e.message); }
});

// ── Movimientos ──────────────────────────────────────────────────────────

// POST /api/credits/card/:cardId/deposit — la clienta deja dinero.
// Además del renglón crea un `Sale` para que el dinero aparezca en Reportes
// HOY (mismo camino que la venta de paquetes: tercera fuente, sin cita).
router.post('/card/:cardId/deposit', async (req, res) => {
  try {
    const { amount, paymentMethod, note, sourceRef } = req.body || {};
    const monto = centavos(amount);
    if (!Number.isFinite(monto) || monto <= 0) return fail(res, 400, 'Monto inválido');
    if (!METODOS.includes(paymentMethod)) return fail(res, 400, 'Método de pago inválido');

    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    if (!card) return fail(res, 404, 'Clienta no encontrada');

    const venta = await prisma.sale.create({
      data: {
        clientName: card.name,
        clientPhone: card.phone,
        serviceName: `Apartado — ${card.name}`,
        serviceAmount: monto,
        productsAmount: 0,
        subtotal: monto,
        total: monto,
        totalAmount: monto,
        paymentMethod,
        date: new Date(),
      },
    });

    const mov = await prisma.clientCredit.create({
      data: {
        cardId: card.id,
        clientPhone: card.phone,
        type: 'deposito',
        amount: monto,
        paymentMethod,
        note: note ? String(note).slice(0, 300) : null,
        saleId: venta.id,
        sourceRef: sourceRef || null,
        createdBy: quienEs(req),
      },
    });

    const balance = await saldoDe(prisma, card.id);
    console.log(`[CREDITS] Apartado de $${monto} (${paymentMethod}) para ${card.name} → saldo $${balance}`);
    res.json({ success: true, data: { movement: serializar(mov), balance } });
  } catch (e) {
    // Choque de sourceRef: ya se había registrado ese mismo depósito.
    if (e.code === 'P2002') return fail(res, 409, 'ese_deposito_ya_existe');
    console.error('[CREDITS DEPOSIT]', e); return fail(res, 500, e.message);
  }
});

// Aplica saldo a una cita. Vive aquí (y no en server.js) para que TODA la
// lógica del dinero apartado esté en un solo archivo; el cobro de cita la
// llama directo. Lanza Error con clave conocida si no se puede.
export async function aplicarCreditoEnCobro({ cardId, clientPhone, amount, appointmentId, by, note }) {
  const monto = centavos(amount);
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('monto_invalido');

  const card = await resolverCard({ cardId, clientPhone });
  if (!card) throw new Error('clienta_no_encontrada');

  return prisma.$transaction(async (tx) => {
    const saldo = await saldoDe(tx, card.id);
    if (monto > saldo + 0.005) throw new Error('saldo_insuficiente');

    const mov = await tx.clientCredit.create({
      data: {
        cardId: card.id,
        clientPhone: card.phone,
        type: 'aplicacion',
        amount: -monto, // el signo lo pone el servidor, siempre
        appointmentId: appointmentId || null,
        note: note || null,
        // Guarda dura: cobrar dos veces la misma cita no puede gastar el
        // saldo dos veces (choca contra el índice único).
        sourceRef: appointmentId ? `appt:${appointmentId}` : null,
        createdBy: by || 'admin',
      },
    });
    return { movement: mov, balance: centavos(saldo - monto), card };
  });
}

// POST /api/credits/card/:cardId/apply — aplicar saldo a mano (sin pasar por
// el cobro de cita). El camino normal es el modal de cobro.
router.post('/card/:cardId/apply', async (req, res) => {
  try {
    const { amount, appointmentId, note } = req.body || {};
    const r = await aplicarCreditoEnCobro({
      cardId: req.params.cardId, amount, appointmentId, note, by: quienEs(req),
    });
    console.log(`[CREDITS] Aplicados $${centavos(amount)} de ${r.card.name} → saldo $${r.balance}`);
    res.json({ success: true, data: { movement: serializar(r.movement), balance: r.balance } });
  } catch (e) {
    const conocidos = {
      monto_invalido: 400, clienta_no_encontrada: 404, saldo_insuficiente: 409,
    };
    if (conocidos[e.message]) return fail(res, conocidos[e.message], e.message);
    if (e.code === 'P2002') return fail(res, 409, 'esa_cita_ya_uso_saldo');
    console.error('[CREDITS APPLY]', e); return fail(res, 500, e.message);
  }
});

// POST /api/credits/movement/:id/revert — deshacer un movimiento (dedazo).
// No borra el renglón: lo marca revertido, para que el dinero deje rastro.
// Si el movimiento era un depósito, borra también su venta, porque ese
// ingreso nunca debió existir.
router.post('/movement/:id/revert', async (req, res) => {
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const mov = await tx.clientCredit.findUnique({ where: { id: req.params.id } });
      if (!mov) throw new Error('movimiento_no_encontrado');
      if (mov.revertedAt) throw new Error('ya_estaba_revertido');
      if (mov.type === 'devolucion') throw new Error('devolucion_no_reversible');

      // Deshacer un depósito no puede dejar el saldo en negativo: si ya se
      // gastó, primero hay que deshacer la aplicación.
      if (mov.type === 'deposito') {
        const saldo = await saldoDe(tx, mov.cardId);
        if (saldo - Number(mov.amount) < -0.005) throw new Error('saldo_ya_usado');
        if (mov.saleId) {
          await tx.sale.delete({ where: { id: mov.saleId } }).catch(() => {});
        }
      }

      await tx.clientCredit.update({
        where: { id: mov.id },
        // Se libera sourceRef para que la cita pueda volver a usar saldo
        // después de corregir; si no, el índice único la dejaría trabada.
        data: { revertedAt: new Date(), revertedBy: quienEs(req), sourceRef: null },
      });
      return { cardId: mov.cardId, type: mov.type, amount: Number(mov.amount) };
    });

    const balance = await saldoDe(prisma, resultado.cardId);
    console.log(`[CREDITS] Revertido ${resultado.type} de $${Math.abs(resultado.amount)} → saldo $${balance}`);
    res.json({ success: true, data: { balance } });
  } catch (e) {
    const conocidos = {
      movimiento_no_encontrado: 404, ya_estaba_revertido: 409,
      devolucion_no_reversible: 409, saldo_ya_usado: 409,
    };
    if (conocidos[e.message]) return fail(res, conocidos[e.message], e.message);
    console.error('[CREDITS REVERT]', e); return fail(res, 500, e.message);
  }
});

// POST /api/credits/card/:cardId/refund — devolverle el dinero a la clienta.
// Sale dinero de la caja: registra un egreso para que la Utilidad Neta siga
// cuadrando. Solo admin (recepción registra y aplica, pero no devuelve).
router.post('/card/:cardId/refund', requireRole('admin'), async (req, res) => {
  try {
    const { amount, paymentMethod, reason } = req.body || {};
    const monto = centavos(amount);
    if (!Number.isFinite(monto) || monto <= 0) return fail(res, 400, 'Monto inválido');
    if (!METODOS.includes(paymentMethod)) return fail(res, 400, 'Método de pago inválido');

    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    if (!card) return fail(res, 404, 'Clienta no encontrada');

    const mov = await prisma.$transaction(async (tx) => {
      const saldo = await saldoDe(tx, card.id);
      if (monto > saldo + 0.005) throw new Error('saldo_insuficiente');
      return tx.clientCredit.create({
        data: {
          cardId: card.id,
          clientPhone: card.phone,
          type: 'devolucion',
          amount: -monto,
          paymentMethod,
          note: reason ? String(reason).slice(0, 300) : null,
          createdBy: quienEs(req),
        },
      });
    });

    // Fecha local (no toISOString: después de las 6pm en México caería en
    // el día siguiente y el egreso se iría al mes que no es).
    const hoy = new Date();
    const fechaLocal = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    await prisma.expense.create({
      data: {
        date: fechaLocal,
        category: 'otros',
        description: `Devolución de apartado — ${card.name}${reason ? ` (${reason})` : ''}`,
        amount: monto,
      },
    }).catch(e => console.warn('[CREDITS] egreso de devolución no registrado:', e.message));

    const balance = await saldoDe(prisma, card.id);
    console.log(`[CREDITS] Devuelto $${monto} a ${card.name} → saldo $${balance}`);
    res.json({ success: true, data: { movement: serializar(mov), balance } });
  } catch (e) {
    if (e.message === 'saldo_insuficiente') return fail(res, 409, 'saldo_insuficiente');
    console.error('[CREDITS REFUND]', e); return fail(res, 500, e.message);
  }
});

export default router;

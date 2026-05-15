// lib/api/coffee-pos.js — Venus The Coffee Bar POS API
import { Router } from 'express';
import { prisma } from '../../src/db/index.js';
import { adminAuth, requireRole } from '../auth.js';

const router = Router();

// All POS routes require admin auth
router.use(adminAuth);

// ==================== PRODUCTS ====================

// GET /api/pos/products — list active products with variants
router.get('/products', async (req, res) => {
  try {
    const showAll = req.query.all === 'true';
    const products = await prisma.coffeeProduct.findMany({
      where: showAll ? {} : { isActive: true },
      include: { variants: { where: showAll ? {} : { isActive: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: products });
  } catch (err) {
    console.error('[POS] Error listing products:', err);
    res.status(500).json({ success: false, error: 'Error al listar productos' });
  }
});

// POST /api/pos/products — create product
router.post('/products', requireRole("admin"), async (req, res) => {
  try {
    const { name, category, price, taxRate, sortOrder, variants } = req.body;
    if (!name || !category || price == null) {
      return res.status(400).json({ success: false, error: 'name, category y price son requeridos' });
    }
    const product = await prisma.coffeeProduct.create({
      data: {
        name,
        category,
        price,
        taxRate: taxRate ?? 0.16,
        sortOrder: sortOrder ?? 0,
        variants: variants?.length ? {
          create: variants.map(v => ({
            name: v.name,
            type: v.type || 'extra',
            priceAdj: v.priceAdj || 0,
          })),
        } : undefined,
      },
      include: { variants: true },
    });
    res.json({ success: true, data: product });
  } catch (err) {
    console.error('[POS] Error creating product:', err);
    res.status(500).json({ success: false, error: 'Error al crear producto' });
  }
});

// PUT /api/pos/products/:id — update product
router.put('/products/:id', requireRole("admin"), async (req, res) => {
  try {
    const { name, category, price, taxRate, sortOrder, isActive } = req.body;
    const product = await prisma.coffeeProduct.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(price !== undefined && { price }),
        ...(taxRate !== undefined && { taxRate }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { variants: true },
    });
    res.json({ success: true, data: product });
  } catch (err) {
    console.error('[POS] Error updating product:', err);
    res.status(500).json({ success: false, error: 'Error al actualizar producto' });
  }
});

// DELETE /api/pos/products/:id — soft delete (deactivate)
router.delete('/products/:id', requireRole("admin"), async (req, res) => {
  try {
    await prisma.coffeeProduct.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[POS] Error deactivating product:', err);
    res.status(500).json({ success: false, error: 'Error al desactivar producto' });
  }
});

// ==================== VARIANTS ====================

router.post('/products/:id/variants', requireRole("admin"), async (req, res) => {
  try {
    const { name, type, priceAdj } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name es requerido' });
    const variant = await prisma.coffeeProductVariant.create({
      data: { productId: req.params.id, name, type: type || 'extra', priceAdj: priceAdj || 0 },
    });
    res.json({ success: true, data: variant });
  } catch (err) {
    console.error('[POS] Error creating variant:', err);
    res.status(500).json({ success: false, error: 'Error al crear variante' });
  }
});

router.delete('/variants/:id', requireRole("admin"), async (req, res) => {
  try {
    await prisma.coffeeProductVariant.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[POS] Error deleting variant:', err);
    res.status(500).json({ success: false, error: 'Error al eliminar variante' });
  }
});

// ==================== SALES ====================

// Generate daily folio: VCB-YYYYMMDD-NNN
async function generateFolio() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `VCB-${y}${m}${d}`;
  const todayCount = await prisma.coffeeSale.count({
    where: { folio: { startsWith: prefix } },
  });
  return `${prefix}-${String(todayCount + 1).padStart(3, '0')}`;
}

// POST /api/pos/sales — register a sale
router.post('/sales', async (req, res) => {
  try {
    const { items, paymentMethod, amountPaid, discount: saleDiscount } = req.body;
    if (!items?.length || !paymentMethod) {
      return res.status(400).json({ success: false, error: 'items y paymentMethod son requeridos' });
    }

    const cashierName = req.admin.email || 'admin';

    // Guardrail recepción: bloquear descuentos y precios fuera de catálogo
    if (req.admin.role === "recepcion") {
      if (Number(saleDiscount || 0) > 0) {
        return res.status(403).json({ success: false, error: "discount_locked" });
      }
      for (const it of items) {
        if (!it.productId) continue;
        if (Number(it.discount || 0) > 0) {
          return res.status(403).json({ success: false, error: "discount_locked" });
        }
        if (it.unitPrice == null) continue;
        const product = await prisma.coffeeProduct.findUnique({ where: { id: it.productId } });
        if (!product) continue;
        let expected = Number(product.price);
        if (Array.isArray(it.variants) && it.variants.length) {
          const variantIds = it.variants.map(v => v?.id).filter(Boolean);
          if (variantIds.length) {
            const variants = await prisma.coffeeProductVariant.findMany({
              where: { id: { in: variantIds } },
            });
            expected += variants.reduce((s, v) => s + Number(v.priceAdj || 0), 0);
          }
        }
        if (Math.abs(Number(it.unitPrice) - expected) > 0.01) {
          return res.status(403).json({ success: false, error: "price_locked" });
        }
      }
    }

    // Get active cash session
    const session = await prisma.coffeeCashSession.findFirst({
      where: { status: 'open' },
      orderBy: { openedAt: 'desc' },
    });

    // Build sale items and calculate totals
    let subtotal = 0;
    const saleItems = [];
    for (const item of items) {
      if (!item.productId || !item.qty || item.qty < 1) continue;
      const product = await prisma.coffeeProduct.findUnique({ where: { id: item.productId } });
      if (!product) continue;
      const unitPrice = Number(item.unitPrice ?? product.price);
      const lineDiscount = Number(item.discount || 0);
      const lineTotal = (unitPrice * item.qty) - lineDiscount;
      subtotal += lineTotal;
      saleItems.push({
        productId: product.id,
        productName: product.name,
        qty: item.qty,
        unitPrice,
        discount: lineDiscount,
        notes: item.notes || null,
        variants: item.variants ? JSON.stringify(item.variants) : null,
      });
    }

    if (!saleItems.length) {
      return res.status(400).json({ success: false, error: 'No hay items válidos' });
    }

    const discountTotal = Number(saleDiscount || 0);
    subtotal -= discountTotal;
    // Los precios ya incluyen IVA — calcular IVA contenido (tax / 1.16 * 0.16) para reporte,
    // pero NO sumarlo al total
    const total = Math.round(subtotal * 100) / 100;
    const tax = Math.round((subtotal - subtotal / 1.16) * 100) / 100;

    const paid = Number(amountPaid || total);
    const change = paymentMethod === 'efectivo' ? Math.max(0, Math.round((paid - total) * 100) / 100) : 0;

    const folio = await generateFolio();

    const sale = await prisma.coffeeSale.create({
      data: {
        folio,
        cashSessionId: session?.id || null,
        cashierName,
        subtotal,
        tax,
        discount: discountTotal,
        total,
        paymentMethod,
        amountPaid: paid,
        change,
        items: { create: saleItems },
      },
      include: { items: true },
    });

    res.json({ success: true, data: sale });
  } catch (err) {
    console.error('[POS] Error creating sale:', err);
    res.status(500).json({ success: false, error: 'Error al registrar venta' });
  }
});

// GET /api/pos/sales — list sales with filters (admin only — reportes)
router.get('/sales', requireRole("admin"), async (req, res) => {
  try {
    const { from, to, cashier, status } = req.query;
    const where = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59.999Z');
    }
    if (cashier) where.cashierName = cashier;
    if (status) where.status = status;

    const sales = await prisma.coffeeSale.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ success: true, data: sales });
  } catch (err) {
    console.error('[POS] Error listing sales:', err);
    res.status(500).json({ success: false, error: 'Error al listar ventas' });
  }
});

// GET /api/pos/sales/:id
router.get('/sales/:id', async (req, res) => {
  try {
    const sale = await prisma.coffeeSale.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!sale) return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    res.json({ success: true, data: sale });
  } catch (err) {
    console.error('[POS] Error getting sale:', err);
    res.status(500).json({ success: false, error: 'Error al obtener venta' });
  }
});

// POST /api/pos/sales/:id/cancel
router.post('/sales/:id/cancel', requireRole("admin"), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, error: 'Se requiere motivo de cancelación' });
    const sale = await prisma.coffeeSale.update({
      where: { id: req.params.id },
      data: { status: 'cancelled', cancelReason: reason, cancelledBy: req.admin.email || 'admin' },
    });
    res.json({ success: true, data: sale });
  } catch (err) {
    console.error('[POS] Error cancelling sale:', err);
    res.status(500).json({ success: false, error: 'Error al cancelar venta' });
  }
});

// ==================== CASH SESSION ====================

// GET /api/pos/cash/current — get active session
router.get('/cash/current', requireRole("admin"), async (req, res) => {
  try {
    const session = await prisma.coffeeCashSession.findFirst({
      where: { status: 'open' },
      orderBy: { openedAt: 'desc' },
      include: { movements: true },
    });
    res.json({ success: true, data: session });
  } catch (err) {
    console.error('[POS] Error getting cash session:', err);
    res.status(500).json({ success: false, error: 'Error al obtener sesión de caja' });
  }
});

// POST /api/pos/cash/open
router.post('/cash/open', requireRole("admin"), async (req, res) => {
  try {
    const { openingAmount } = req.body;
    if (openingAmount == null) {
      return res.status(400).json({ success: false, error: 'openingAmount es requerido' });
    }
    // Check no open session exists
    const existing = await prisma.coffeeCashSession.findFirst({ where: { status: 'open' } });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Ya hay una sesión de caja abierta. Ciérrala primero.' });
    }
    const session = await prisma.coffeeCashSession.create({
      data: { openedBy: req.admin.email || 'admin', openingAmount },
    });
    res.json({ success: true, data: session });
  } catch (err) {
    console.error('[POS] Error opening cash session:', err);
    res.status(500).json({ success: false, error: 'Error al abrir caja' });
  }
});

// POST /api/pos/cash/close
router.post('/cash/close', requireRole("admin"), async (req, res) => {
  try {
    const { actualCash, notes } = req.body;
    if (actualCash == null) {
      return res.status(400).json({ success: false, error: 'actualCash es requerido' });
    }
    const session = await prisma.coffeeCashSession.findFirst({
      where: { status: 'open' },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) return res.status(400).json({ success: false, error: 'No hay sesión de caja abierta' });

    // Calculate expected cash
    const salesAgg = await prisma.coffeeSale.aggregate({
      where: { cashSessionId: session.id, status: 'completed' },
      _sum: { total: true },
    });
    const cashSalesAgg = await prisma.coffeeSale.aggregate({
      where: { cashSessionId: session.id, status: 'completed', paymentMethod: 'efectivo' },
      _sum: { total: true },
    });
    const movementsAgg = await prisma.coffeeCashMovement.aggregate({
      where: { cashSessionId: session.id },
      _sum: { amount: true },
    });
    // Net movements (income positive, withdrawal negative is handled by type)
    const movements = await prisma.coffeeCashMovement.findMany({ where: { cashSessionId: session.id } });
    let movementNet = 0;
    for (const m of movements) {
      movementNet += m.type === 'income' ? Number(m.amount) : -Number(m.amount);
    }

    const totalSales = Number(salesAgg._sum.total || 0);
    const cashFromSales = Number(cashSalesAgg._sum.total || 0);
    const expectedCash = Number(session.openingAmount) + cashFromSales + movementNet;
    const difference = Number(actualCash) - expectedCash;

    const updated = await prisma.coffeeCashSession.update({
      where: { id: session.id },
      data: {
        closedBy: req.admin.email || 'admin',
        closedAt: new Date(),
        expectedCash: Math.round(expectedCash * 100) / 100,
        actualCash: Number(actualCash),
        difference: Math.round(difference * 100) / 100,
        totalSales: Math.round(totalSales * 100) / 100,
        status: 'closed',
        notes: notes || null,
      },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[POS] Error closing cash session:', err);
    res.status(500).json({ success: false, error: 'Error al cerrar caja' });
  }
});

// POST /api/pos/cash/movement
router.post('/cash/movement', requireRole("admin"), async (req, res) => {
  try {
    const { type, amount, reason } = req.body;
    if (!type || !amount || !reason) {
      return res.status(400).json({ success: false, error: 'type, amount y reason son requeridos' });
    }
    if (!['income', 'withdrawal'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type debe ser income o withdrawal' });
    }
    const session = await prisma.coffeeCashSession.findFirst({ where: { status: 'open' } });
    if (!session) return res.status(400).json({ success: false, error: 'No hay sesión de caja abierta' });

    const movement = await prisma.coffeeCashMovement.create({
      data: { cashSessionId: session.id, type, amount, reason, createdBy: req.admin.email || 'admin' },
    });
    res.json({ success: true, data: movement });
  } catch (err) {
    console.error('[POS] Error creating movement:', err);
    res.status(500).json({ success: false, error: 'Error al registrar movimiento' });
  }
});

// ==================== REPORTS ====================

// GET /api/pos/reports/daily?date=YYYY-MM-DD
router.get('/reports/daily', requireRole("admin"), async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
    const start = new Date(dateStr + 'T00:00:00.000Z');
    const end = new Date(dateStr + 'T23:59:59.999Z');

    const sales = await prisma.coffeeSale.findMany({
      where: { createdAt: { gte: start, lte: end }, status: 'completed' },
      include: { items: true },
    });

    const totalSales = sales.reduce((s, sale) => s + Number(sale.total), 0);
    const totalTax = sales.reduce((s, sale) => s + Number(sale.tax), 0);
    const byMethod = {};
    for (const sale of sales) {
      byMethod[sale.paymentMethod] = (byMethod[sale.paymentMethod] || 0) + Number(sale.total);
    }

    // Top products
    const productMap = {};
    for (const sale of sales) {
      for (const item of sale.items) {
        if (!productMap[item.productName]) productMap[item.productName] = { qty: 0, revenue: 0 };
        productMap[item.productName].qty += item.qty;
        productMap[item.productName].revenue += Number(item.unitPrice) * item.qty;
      }
    }
    const topProducts = Object.entries(productMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        date: dateStr,
        salesCount: sales.length,
        totalSales: Math.round(totalSales * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
        byPaymentMethod: byMethod,
        topProducts,
        averageTicket: sales.length ? Math.round((totalSales / sales.length) * 100) / 100 : 0,
      },
    });
  } catch (err) {
    console.error('[POS] Error daily report:', err);
    res.status(500).json({ success: false, error: 'Error al generar reporte' });
  }
});

// GET /api/pos/reports/top-products?from=&to=
router.get('/reports/top-products', requireRole("admin"), async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const to = req.query.to ? new Date(req.query.to + 'T23:59:59.999Z') : new Date();

    const items = await prisma.coffeeSaleItem.findMany({
      where: { sale: { createdAt: { gte: from, lte: to }, status: 'completed' } },
    });

    const productMap = {};
    for (const item of items) {
      if (!productMap[item.productName]) productMap[item.productName] = { qty: 0, revenue: 0 };
      productMap[item.productName].qty += item.qty;
      productMap[item.productName].revenue += Number(item.unitPrice) * item.qty;
    }
    const topProducts = Object.entries(productMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue);

    res.json({ success: true, data: topProducts });
  } catch (err) {
    console.error('[POS] Error top products report:', err);
    res.status(500).json({ success: false, error: 'Error al generar reporte' });
  }
});

export default router;

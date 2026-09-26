import test from 'node:test';
import assert from 'node:assert/strict';
import { sameClient, unpaid, allocate, checkoutGroup } from '../src/services/groupedCheckout.js';

const version = '2026-09-25T12:00:00.000Z';
function fixture() {
  let rows = ['a', 'b'].map(id => ({ id, cardId: 'c', clientPhone: '4271234567', clientName: 'Test', serviceName: id, date: '2026-09-25', status: 'confirmed', totalPaid: null, updatedAt: new Date(version) }));
  let sales = [], credits = [];
  const prisma = { $transaction: async (fn, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const copy = structuredClone(rows), s = [], c = [];
    const result = await fn({
      appointment: { findMany: async () => copy, updateMany: async ({ where, data }) => { Object.assign(copy.find(r => r.id === where.id), data); return { count: 1 }; } },
      card: { findUnique: async () => ({ id: 'c', phone: '4271234567' }) },
      clientCredit: { aggregate: async () => ({ _sum: { amount: 100 } }), create: async ({ data }) => { c.push(data); } },
      sale: { deleteMany: async () => {}, create: async ({ data }) => { s.push(data); } },
    });
    rows = copy; sales = s; credits = c; return result;
  } };
  const body = { groupItems: [{ id: 'a', price: 650, version }, { id: 'b', price: 350, version }], totalPaid: 800, discount: 100, creditApplied: 100, paymentMethod: 'efectivo' };
  return { prisma, body, rows: () => rows, sales: () => sales, credits: () => credits };
}

test('client matching prefers card identity and never names', () => {
  assert.equal(sameClient({ cardId: 'a', clientPhone: '4271234567' }, { cardId: 'b', clientPhone: '4271234567' }), false);
  assert.equal(sameClient({ clientPhone: '524271234567' }, { clientPhone: '4271234567' }), true);
  assert.equal(sameClient({ clientName: 'Test' }, { clientName: 'Test' }), false);
  assert.equal(unpaid({ status: 'completed', totalPaid: 0 }), false);
  assert.equal(unpaid({ status: 'cancelled', totalPaid: null }), false);
});
test('allocation preserves every cent', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [33, 34, 33]);
});
test('one atomic checkout distributes discount and credit without duplicating income', async () => {
  const f = fixture(); await checkoutGroup(f.prisma, 'a', f.body, { role: 'admin' });
  assert.equal(f.rows().reduce((s, r) => s + r.totalPaid, 0), 800);
  assert.equal(f.sales().reduce((s, r) => s + r.total, 0), 800);
  assert.equal(f.credits().reduce((s, r) => s + r.amount, 0), -100);
  assert.ok(f.rows().every(r => r.status === 'completed'));
  await assert.rejects(checkoutGroup(f.prisma, 'a', f.body, { role: 'admin' }), /pendientes/);
});
test('changed, foreign, cancelled and other-day appointments fail before charging', async () => {
  for (const changes of [{ cardId: 'other' }, { status: 'cancelled' }, { date: '2026-09-26' }, { updatedAt: new Date('2026-09-25T13:00:00Z') }]) {
    const f = fixture(); Object.assign(f.rows()[1], changes);
    await assert.rejects(checkoutGroup(f.prisma, 'a', f.body, { role: 'admin' }));
    assert.equal(f.sales().length, 0); assert.equal(f.rows()[0].totalPaid, null);
  }
});
test('invalid totals and insufficient balance cannot charge', async () => {
  for (const changes of [{ totalPaid: 900 }, { creditApplied: 200, totalPaid: 700 }, { paymentMethod: 'unknown' }]) {
    const f = fixture(); await assert.rejects(checkoutGroup(f.prisma, 'a', { ...f.body, ...changes }, { role: 'admin' }));
    assert.equal(f.sales().length, 0);
  }
});
test('reception cannot discount and marketing cannot charge', async () => {
  for (const role of ['recepcion', 'marketing']) {
    const f = fixture(); await assert.rejects(checkoutGroup(f.prisma, 'a', f.body, { role }));
  }
});
test('products appear once and remain part of the combined total', async () => {
  const f = fixture(); f.body.productsSold = [{ name: 'Test', price: 50, quantity: 2, subtotal: 100 }]; f.body.totalPaid = 900;
  await checkoutGroup(f.prisma, 'a', f.body, { role: 'admin' });
  assert.equal(f.sales().reduce((s, r) => s + r.productsAmount, 0), 100);
  assert.equal(f.sales()[1].productsSold.length, 0);
  assert.equal(f.sales().reduce((s, r) => s + r.total, 0), 900);
});

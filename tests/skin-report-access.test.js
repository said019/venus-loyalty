import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkinReportAccess } from '../src/services/skinReportAccess.js';

test('random report credentials are hashed, card-bound and revoked by rotation', async () => {
  const rows = new Map();
  const access = createSkinReportAccess({ prisma: { setting: {
    upsert: async ({ where, create, update }) => rows.set(where.key, rows.has(where.key) ? update : create),
    findUnique: async ({ where }) => rows.get(where.key) || null,
  } } });
  assert.equal(await access.verify('card_123', undefined), false);
  const first = await access.issue('card_123');
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(await access.verify('card_123', first), true);
  assert.equal(await access.verify('card_456', first), false);
  assert.ok(!JSON.stringify([...rows.values()]).includes(first));
  const second = await access.issue('card_123');
  assert.notEqual(first, second);
  assert.equal(await access.verify('card_123', first), false);
  assert.equal(await access.verify('card_123', second), true);
});

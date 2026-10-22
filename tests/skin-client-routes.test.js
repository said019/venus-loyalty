import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSkinClientRouter } from '../src/routes/skinClient.js';

async function start(t, report) {
  const app = express();
  app.use('/api/public/card', createSkinClientRouter({ report }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/api/public/card`;
}

test('public skin report routes: headers, status mapping, id validation and exact service calls', async t => {
  const calls = [];
  const report = {
    listForCard: async cardId => { calls.push(['list', cardId]); return cardId === 'card-x' ? null : [{ id: 'v1', kind: 'venus' }]; },
    getForCard: async (cardId, id) => { calls.push(['get', cardId, id]); return cardId === 'card-x' ? null : { id }; },
  };
  const base = await start(t, report);
  const noindex = res => {
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  };

  const list = await fetch(base + '/card-a/skin-reports');
  assert.equal(list.status, 200); noindex(list);
  assert.deepEqual(await list.json(), { success: true, data: [{ id: 'v1', kind: 'venus' }] });
  const detail = await fetch(base + '/card-a/skin-reports/v2');
  assert.equal(detail.status, 200); noindex(detail);
  assert.deepEqual(await detail.json(), { success: true, data: { id: 'v2' } });
  assert.deepEqual(calls, [['list', 'card-a'], ['get', 'card-a', 'v2']]);

  for (const path of ['/card-x/skin-reports', '/card-x/skin-reports/v2']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 404); noindex(res);
    assert.deepEqual(await res.json(), { success: false, error: 'not_found' });
  }

  calls.length = 0;
  for (const path of ['/card-a%2F..%2F/skin-reports', '/card-a/skin-reports/..%2F', '/card-a/skin-reports/v%20x', '/card%20a/skin-reports', '/card-a/skin-reports/' + 'x'.repeat(129)]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 400, path); noindex(res);
    assert.deepEqual(await res.json(), { success: false, error: 'invalid_input' });
  }
  assert.deepEqual(calls, []);
});

test('public skin report routes hide internal errors', async t => {
  const boom = async () => { throw new Error('secret db detail'); };
  const base = await start(t, { listForCard: boom, getForCard: boom });
  const logged = [];
  const original = console.error;
  console.error = (...args) => { logged.push(args); };
  t.after(() => { console.error = original; });
  for (const path of ['/card-a/skin-reports', '/card-a/skin-reports/v1']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 500);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { success: false, error: 'internal_error' });
    assert.doesNotMatch(text, /secret/);
  }
  assert.equal(logged.length, 2);
  assert.equal(logged[0][0], '[skin-client]');
});

test('router does not touch headers of legacy endpoints it falls through to', async t => {
  const app = express();
  app.use('/api/public/card', createSkinClientRouter({ report: { listForCard: async () => [], getForCard: async () => ({}) } }));
  app.get('/api/public/card/:id', (req, res) => res.json({ legacy: req.params.id }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/public/card/card-a`);
  assert.deepEqual(await res.json(), { legacy: 'card-a' });
  assert.equal(res.headers.get('x-robots-tag'), null);
  assert.notEqual(res.headers.get('cache-control'), 'private, no-store');
});

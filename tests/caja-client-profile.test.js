import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('    async function abrirPerfilDesdeCaja('), html.indexOf('    async function descartarPendienteCaja('));
function setup(responses) {
  const calls = [], opened = [], notices = [];
  const context = vm.createContext({
    apiFetch: async url => { calls.push(url); return responses.shift(); },
    cardsCache: {}, window: { cardsCache: {} },
    openCardModal: async card => opened.push(card),
    showNotification: (...args) => notices.push(args),
    console: { error() {} }, encodeURIComponent,
  });
  vm.runInContext(source, context);
  const button = { disabled: false, setAttribute() {}, removeAttribute() {} };
  return { context, calls, opened, notices, button, run: cita => context.abrirPerfilDesdeCaja(cita, button) };
}
const ok = data => ({ ok: true, json: async () => ({ success: true, data }) });

test('opens the linked card even when names coincide and refreshes profile cache', async () => {
  const card = { id: 'card-two', name: 'Ana', phone: '4271234567' };
  const t = setup([ok(card)]);
  t.context.cardsCache.other = { id: 'other', name: 'Ana' };
  await t.run({ cardId: card.id, clientName: 'Ana', clientPhone: 'different' });
  assert.deepEqual(t.calls, ['/api/card/card-two']);
  assert.deepEqual(t.opened, [card]);
  assert.equal(t.context.cardsCache[card.id], card);
  assert.equal(t.button.disabled, false);
});

test('legacy appointments resolve by phone then fetch the full profile', async () => {
  const card = { id: 'resolved', name: 'Ana' };
  const t = setup([ok({ cardId: card.id }), ok(card)]);
  await t.run({ clientPhone: '+52 4271234567' });
  assert.deepEqual(t.calls, ['/api/credits/lookup?phone=%2B52%204271234567', '/api/card/resolved']);
  assert.deepEqual(t.opened, [card]);
});

test('missing linked profile does not open a different client', async () => {
  for (const cita of [{ clientName: 'Ana' }, { clientPhone: '4271234567' }]) {
    const t = setup([ok({ cardId: null })]);
    await t.run(cita);
    assert.equal(t.opened.length, 0);
    assert.match(t.notices[0][0], /no tiene una ficha vinculada/);
    assert.equal(t.button.disabled, false);
  }
});

test('network failures and deleted cards allow retry without opening a stale profile', async () => {
  for (const response of [{ ok: false }, { ok: true, json: async () => ({ success: false }) }]) {
    const t = setup([response]);
    await t.run({ cardId: 'deleted' });
    assert.equal(t.opened.length, 0);
    assert.equal(t.notices[0][1], 'error');
    assert.equal(t.button.disabled, false);
  }
});

test('double clicks only open one profile', async () => {
  const t = setup([ok({ id: 'one' })]);
  await Promise.all([t.run({ cardId: 'one' }), t.run({ cardId: 'one' })]);
  assert.equal(t.calls.length, 1);
  assert.equal(t.opened.length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const start = html.indexOf('    const creditRevertsPending');
assert.ok(start >= 0);
const end = html.indexOf('    // Cargar servicios al abrir', start);
assert.ok(end > start);
const source = html.slice(start, end);

function setup(overrides = {}) {
  const calls = [], alerts = [], refreshes = [];
  const context = {
    window: { currentCardId: 'client-a' }, console: { error() {} },
    venusConfirm: async () => true,
    venusAlert: async message => alerts.push(message),
    apiFetch: async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => ({ success: true }) };
    },
    loadCardCredits: async id => refreshes.push(id),
    cargarCaja: async () => refreshes.push('caja'),
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, calls, alerts, refreshes, run: context.window.revertCreditMovement };
}

test('reverts once on double click and refreshes the correct client', async () => {
  const s = setup(), button = { disabled: false };
  await Promise.all([s.run('movement-a', 'client-a', 100, button), s.run('movement-a', 'client-a', 100, button)]);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0][0], '/api/credits/movement/movement-a/revert');
  assert.equal(s.calls[0][1].method, 'POST');
  assert.deepEqual(s.refreshes, ['client-a', 'caja']);
  assert.equal(button.disabled, false);
});

test('cancel makes no request and unlocks the button', async () => {
  const s = setup({ venusConfirm: async () => false }), button = { disabled: false };
  await s.run('movement-a', 'client-a', 100, button);
  assert.equal(s.calls.length, 0);
  assert.equal(button.disabled, false);
});

test('used balance rejection does not report success', async () => {
  const s = setup({ apiFetch: async () => ({ ok: false, json: async () => ({ success: false, error: 'saldo_ya_usado' }) }) });
  await s.run('movement-a', 'client-a', 100);
  assert.equal(s.refreshes.length, 0);
  assert.match(s.alerts[0], /ya se us/);
});

test('does not replace another client history', async () => {
  const s = setup();
  await s.run('movement-a', 'client-b', 100);
  assert.deepEqual(s.refreshes, ['caja']);
});

test('refresh failure explicitly confirms the completed reversal', async () => {
  const s = setup({ cargarCaja: async () => { throw new Error('offline'); } });
  await s.run('movement-a', 'client-a', 100);
  assert.equal(s.calls.length, 1);
  assert.match(s.alerts[0], /ya se deshizo/);
});

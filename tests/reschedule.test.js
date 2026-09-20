import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const routes = server.slice(server.indexOf("app.patch('/api/appointments/:id',"), server.indexOf('// PATCH /api/appointments/:id/status'));

function setup({ conflicts = [], sendSuccess = true } = {}) {
  const handlers = {};
  const updates = [];
  const messages = [];
  const checks = [];
  const appointment = { id: 'test', date: '2026-10-01', time: '11:00', durationMinutes: 120, serviceName: 'Depilación', clientName: 'Prueba', clientPhone: 'test', status: 'rescheduling' };
  const context = {
    app: { patch: (path, auth, handler) => { handlers.patch = handler; }, post: (path, auth, handler) => { handlers.retry = handler; } },
    adminAuth() {}, console: { log() {}, warn() {}, error() {} },
    AppointmentsRepo: {
      findById: async () => ({ ...appointment }),
      findConflicts: async (...args) => { checks.push(args); return conflicts; },
      update: async (id, data) => { updates.push(data); Object.assign(appointment, data); }
    },
    WhatsAppService: { sendReagendamientoConfirmado: async data => { messages.push(data); return { success: sendSuccess }; } },
    NotificationsRepo: { create: async () => {} }
  };
  vm.runInNewContext(routes, context);
  async function call(body, handler = 'patch') {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handlers[handler]({ params: { id: 'test' }, admin: { role: 'admin' }, body }, res);
    return res;
  }
  return { call, updates, messages, checks };
}

test('reagendar conserva duración y avisa con la nueva fecha', async () => {
  const h = setup();
  const res = await h.call({ date: '2026-10-02', time: '12:00' });
  assert.equal(res.code, 200);
  assert.equal(h.checks[0][2], 120);
  assert.equal(h.updates[0].durationMinutes, 120);
  assert.equal(h.updates[0].status, 'scheduled');
  assert.equal(h.messages[0].date, '2026-10-02');
  assert.equal(res.data.notification.status, 'sent');
});

test('un conflicto no modifica ni envía mensajes', async () => {
  const h = setup({ conflicts: [{ clientName: 'Otra clienta', time: '12:00' }] });
  const res = await h.call({ date: '2026-10-02', time: '12:00' });
  assert.equal(res.code, 409);
  assert.equal(h.updates.length, 0);
  assert.equal(h.messages.length, 0);
});

test('fallo del aviso conserva la cita; reintentar no vuelve a guardarla', async () => {
  const h = setup({ sendSuccess: false });
  const res = await h.call({ date: '2026-10-02', time: '12:00' });
  assert.equal(res.data.success, true);
  assert.equal(res.data.notification.status, 'failed');
  await h.call({}, 'retry');
  assert.equal(h.updates.length, 1);
  assert.equal(h.messages.length, 2);
});

test('sin aviso no llama WhatsApp', async () => {
  const h = setup();
  const res = await h.call({ date: '2026-10-02', time: '12:00', notifyClient: false });
  assert.equal(res.data.notification.status, 'skipped');
  assert.equal(h.messages.length, 0);
});

test('rechaza fechas imposibles antes de guardar', async () => {
  const h = setup();
  const res = await h.call({ date: '2026-02-30', time: '12:00' });
  assert.equal(res.code, 400);
  assert.equal(h.updates.length, 0);
});

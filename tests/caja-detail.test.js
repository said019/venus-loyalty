import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const start = html.indexOf('    async function viewPaymentDetails(');
const end = html.indexOf('    function closePaymentDetail(', start);
const wrapperStart = html.indexOf('    function verDetalleCaja(');
const wrapperEnd = html.indexOf('    // Exponer funciones globalmente', wrapperStart);

function setup() {
  const requests = [];
  const notifications = [];
  const alerts = [];
  const content = { innerHTML: '' };
  let opened = 0;
  const context = {
    apiFetch: async url => {
      requests.push(url);
      return { json: async () => ({ success: true, data: {
        clientName: 'Clienta de prueba', serviceName: 'Limpieza profunda',
        totalPaid: 617.5, serviceAmount: 650, paymentMethod: 'efectivo'
      } }) };
    },
    document: { getElementById: id => {
      if (id === 'payment-detail-content') return content;
      if (id === 'paymentDetailDialog') return { showModal: () => { opened++; } };
      throw new Error(`Unexpected element: ${id}`);
    } },
    showNotification: (...args) => notifications.push(args),
    venusAlert: async message => alerts.push(message),
    console
  };
  vm.runInNewContext(html.slice(start, end) + html.slice(wrapperStart, wrapperEnd), context);
  return { context, requests, notifications, alerts, content, opened: () => opened };
}

test('el detalle de caja abre el pago de la cita seleccionada', async () => {
  const h = setup();
  await h.context.verDetalleCaja('cita-123', 'cita');
  assert.deepEqual(h.requests, ['/api/appointments/cita-123']);
  assert.equal(h.opened(), 1);
  assert.match(h.content.innerHTML, /Clienta de prueba/);
  assert.match(h.content.innerHTML, /617[.,]5/);
  assert.equal(h.notifications.length, 0);
  assert.equal(h.alerts.length, 0);
  assert.match(html, /id="paymentDetailDialog"/);
});

test('la llamada anterior sin tipo sigue abriendo el detalle', async () => {
  const h = setup();
  await h.context.verDetalleCaja('cita-456');
  assert.equal(h.opened(), 1);
});

test('ventas y café no se consultan como citas', async () => {
  const h = setup();
  await h.context.verDetalleCaja('venta-1', 'producto');
  await h.context.verDetalleCaja('ticket-1', 'cafe');
  assert.equal(h.requests.length, 0);
  assert.equal(h.opened(), 0);
  assert.equal(h.notifications.length, 2);
});

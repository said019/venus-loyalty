import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const start = source.indexOf("window.addEventListener('load', async function openSkinAppointment()");
const end = source.indexOf('}, { once: true });', start) + '}, { once: true });'.length;

async function run({ missing = false, fail = false } = {}) {
    let handler, opened = 0, cleaned, alert;
    const input = { value: '', dataset: {} };
    const context = {
        URL, console: { error() {} },
        window: {
            location: { href: 'http://localhost/admin?nuevaCita=1&cardId=card&serviceId=service&calendar=week#agenda' },
            addEventListener: (_event, fn) => { handler = fn; },
            openNewAppointmentModal: () => { opened++; },
        },
        history: { state: null, replaceState: (_state, _title, url) => { cleaned = url; } },
        document: { getElementById: () => input },
        allClients: missing ? [] : [{ id: 'card', name: 'Test', phone: '123' }],
        allServices: missing ? [] : [{ id: 'service', name: 'Facial', price: '650', durationMinutes: 60 }],
        loadServices: async () => { if (fail) throw new Error('offline'); },
        loadClients: async () => {},
        selectedServices: [], selectedClientPhone: '',
        renderSelectedServices() {}, calculateEndTime() {}, showClientSelectedFeedback() {},
        loadClientHistory() {}, loadClientLoyalty() {}, loadClinicalAlerts() {},
        venusAlert: async message => { alert = message; },
    };
    vm.runInNewContext(source.slice(start, end), context);
    await handler();
    return { context, input, opened, cleaned, alert };
}

test('skin booking prefills exact client and service, without saving, and preserves unrelated URL state', async () => {
    const result = await run();
    assert.equal(result.opened, 1);
    assert.equal(result.input.dataset.clientId, 'card');
    assert.equal(result.context.selectedServices[0].id, 'service');
    assert.equal(result.context.selectedServices[0].price, 650);
    assert.equal(result.cleaned, '/admin?calendar=week#agenda');
    assert.equal(result.alert, undefined);
});

test('missing booking entities require selection and loading failure does not open or clear the request', async () => {
    const missing = await run({ missing: true });
    assert.equal(missing.context.selectedServices.length, 0);
    assert.match(missing.alert, /ya no/);
    const failure = await run({ fail: true });
    assert.equal(failure.opened, 0);
    assert.equal(failure.cleaned, undefined);
    assert.match(failure.alert, /No se pudo/);
});

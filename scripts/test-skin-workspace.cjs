// DOM integration test against the isolated synthetic preview server.
// NODE_PATH may point to a temporary jsdom installation; no production requests.
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const base = 'http://127.0.0.1:8131';
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('Timed out waiting for UI');
}
(async () => {
  const errors = [];
  const console = new VirtualConsole(); console.on('jsdomError', error => errors.push(error));
  const dom = await JSDOM.fromURL(base + '/skin-advisor.html?recordId=demo', {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console,
    beforeParse(window) { window.fetch = (url, options) => fetch(new URL(url, base), options); },
  });
  try {
    const d = dom.window.document;
    const el = id => d.getElementById(id);
    const change = input => input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await until(() => !el('save').disabled);
    // Preview server can contain prior synthetic drafts: return to the new session.
    d.querySelector('[data-step="1"]').click();
    assert.equal(el('step-consultation').hidden, true);
    assert.equal(el('photos').querySelectorAll('input:checked').length, 1);
    assert.equal(el('photos').querySelectorAll('select').length, 0);
    assert.equal(el('capture-preview').hidden, false);
    el('next-consultation').click();
    assert.equal(el('step-consultation').hidden, true, 'white-light confirmation remains mandatory');
    el('white-light').checked = true;
    el('next-consultation').click();
    assert.equal(el('step-photos').hidden, true);
    assert.equal(el('step-consultation').hidden, false);
    assert.equal(d.querySelectorAll('#photo-data details:not([hidden])').length, 1);
    el('consent').checked = true;
    el('save').click();
    await until(() => !el('save').disabled);
    assert.match(el('message').textContent, /Falta revisar/);
    const photoChecks = d.querySelectorAll('#photos input[type=checkbox]');
    photoChecks[1].checked = true; change(photoChecks[1]);
    el('confirm-session').click();
    const selectedDetails = [...d.querySelectorAll('#photo-data details:not([hidden])')];
    assert.equal(selectedDetails.length, 2);
    selectedDetails.forEach(item => {
      assert.equal(item.querySelectorAll('select')[1].value, 'upright');
      assert.equal(item.querySelectorAll('input[type=checkbox]')[0].checked, true);
      assert.equal(item.querySelectorAll('input[type=checkbox]')[1].checked, false, 'bulk date confirmation does not invent laterality');
    });
    photoChecks[2].checked = true; change(photoChecks[2]);
    assert.equal(d.querySelectorAll('#photo-data details')[2].querySelector('input[type=checkbox]').checked, false, 'new selection does not inherit attestation');
    photoChecks[2].checked = false; change(photoChecks[2]);
    const details = d.querySelector('#photo-data details:not([hidden])');
    details.querySelectorAll('select')[1].value = 'upright';
    const checks = details.querySelectorAll('input[type=checkbox]');
    checks[0].checked = true; checks[1].checked = true; change(checks[0]);
    // Editing a confirmed capture time must invalidate its attestation.
    const date = details.querySelector('input[type=datetime-local]');
    date.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal(checks[0].checked, false);
    checks[0].checked = true; change(checks[0]);
    el('save').click();
    await until(() => !el('review').hidden && !el('generate').hidden);
    assert.equal(el('step-consultation').hidden, true);
    assert.equal(el('consent').checked, false);
    assert.match(el('result').textContent, /Fotos incluidas/);
    assert.match(el('result').textContent, /Conocer mi piel/);
    el('generate').click();
    assert.equal(el('state').textContent, 'Análisis en curso');
    assert.equal(el('generate').hidden, true);
    assert.ok(el('result').querySelector('progress'));
    await until(() => d.querySelector('.report-tabs'));
    assert.equal(el('result').querySelector('progress'), null);
    const tabs = d.querySelectorAll('.report-observations .report-tabs button');
    assert.equal(tabs.length, 2);
    assert.equal(el('findings-panel-1').hidden, true);
    tabs[1].click();
    assert.equal(el('findings-panel-0').hidden, true);
    assert.equal(el('findings-panel-1').hidden, false);
    assert.match(el('result').textContent, /Alcance y limitaciones/);
    assert.match(el('result').textContent, /Tu piel, en detalle/);
    const filter = d.querySelector('select[aria-label="Vista de la fotografía"]');
    filter.value = 'red_contrast'; change(filter);
    await until(() => /no medición/.test(d.querySelector('.report-visual-note').textContent));
    assert.match(d.querySelector('.photo-report-face>img').src, /^data:image\/jpeg;base64,/);
    filter.value = 'original'; change(filter);
    assert.match(d.querySelector('.photo-report-face>img').src, /skin-demo-frontal/);
    assert.equal(el('approval-form').hidden, true, 'simulation cannot be approved');
    assert.equal(d.querySelector('.photo-report-print'), null, 'simulation cannot be exported as approved');
    assert.equal(errors.length, 0, errors.map(e => e.message).join('\n'));
    process.stdout.write('PASS: photo selection, step navigation, required confirmations, draft, simulation, report tabs and approval guard.\n');
  } finally { dom.window.close(); }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });

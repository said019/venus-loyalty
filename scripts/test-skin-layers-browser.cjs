// Isolated synthetic preview only; no database or external analysis provider.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.SKIN_PREVIEW_URL || 'http://127.0.0.1:8136';

(async () => {
  const post = async (path, body) => {
    const response = await fetch(base + '/api/skin-advisor' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const row = await post('/records/demo/assessments', { consentAccepted: true, whiteLightOriginalConfirmed: true, photos: [{ id: 'demo-photo-0', zone: 'full_face', orientation: 'upright', lateralityResolved: true, capturedAt: '2026-09-22T20:00:00Z' }] });
  await post('/assessments/' + row.id + '/generate', {});
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = []; page.on('pageerror', err => errors.push(err.message));
      await page.goto(base + '/skin-advisor.html?recordId=demo');
      await page.getByRole('button', { name: 'Generar mapas', exact: true }).click();
      const maps = page.getByLabel('Mapa de la fotografía', { exact: true });
      await maps.waitFor({ state: 'visible', timeout: 200000 });
      assert.equal(await maps.locator('option').count(), 6);
      for (const key of ['poros', 'textura', 'manchas', 'lesiones', 'zonas_rojas', 'brillo']) {
        await maps.selectOption(key);
        await page.waitForFunction(() => { const i = document.querySelector('.photo-report-face>img'); return i.complete && i.naturalWidth > 0 && i.src.startsWith('data:image/jpeg'); });
      }
      await maps.selectOption('poros');
      assert.ok(await page.locator('.report-visual-note').textContent().then(t => t.includes('Candidatos:')));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('.report-stage').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/venus-layers-' + width + '.png' });
      await page.getByLabel('Vista de la fotografía', { exact: true }).selectOption('original');
      assert.match(await page.locator('.photo-report-face>img').getAttribute('src'), /skin-demo-frontal/);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: desktop/mobile, six rendered maps, original restoration, no overflow or JS errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync('public/admin.html', 'utf8');
function extract(start, end) { const at = source.indexOf(start); return source.slice(at, source.indexOf(end, at)); }
const open = extract('async function abrirCobrarCita(citaId)', '// Editar precio del servicio');
// Exercise the actual modal declarations without booting unrelated admin tabs.
const totalsEnd = source.indexOf('\n    async function cargarApartadoCobro', source.indexOf('function actualizarTotalCobro()'));
const totalsCode = source.slice(source.indexOf('function actualizarTotalCobro()'), totalsEnd);
const pay = extract('async function procesarCobroCita(citaId)', '// Función wrapper');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1280, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>');
      for (const file of ['admin-base.css', 'admin-extra.css', 'admin-redesign.css', 'admin-mobile.css']) {
        await page.addStyleTag({ content: fs.readFileSync('public/css/admin/' + file, 'utf8') });
      }
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await page.evaluate(() => {
        Object.assign(window, { citaActualId: null, precioServicioGlobal: 0, productosEnCobro: [], productosDisponibles: [], tipoDescuento: 'fijo', citasNuevoApartadoCargadas: false,
          leerNuevoApartado: () => 0, cargarApartadoCobro: () => {}, cargarCaja: () => {}, showNotification: (text, type) => { if (type === 'error') throw new Error(text); } });
        const a = { id: 'a', clientName: 'Clienta de prueba', clientPhone: '4271234567', date: '2026-09-25', time: '09:00', status: 'confirmed', serviceId: 's1', serviceName: 'Facial', updatedAt: '2026-09-25T12:00:00.000Z' };
        window.apiFetch = async url => ({ json: async () => ({ success: true, data: url.endsWith('/checkout-group') ? [a, { ...a, id: 'b', serviceId: 's2', serviceName: 'Masaje', time: '10:00' }] : url === '/api/appointments/a' ? a : url === '/api/services' ? [{ id: 's1', name: 'Facial', price: 650 }, { id: 's2', name: 'Masaje', price: 350 }] : [] }) });
        window.fetch = async (url, options) => { window.sent = JSON.parse(options.body); return { json: async () => ({ success: true }) }; };
      });
      await page.addScriptTag({ content: open + '\n' + totalsCode + '\n' + pay });
      // Retain the balance stub if the adjacent extracted block defines it.
      await page.evaluate(async () => { window.cargarApartadoCobro = () => {}; await abrirCobrarCita('a'); });
      assert.equal(await page.locator('#total-cobro').textContent(), '$1000');
      await page.getByLabel('Incluir Masaje').uncheck();
      assert.equal(await page.locator('#total-cobro').textContent(), '$650');
      await page.getByLabel('Incluir Masaje').check();
      await page.getByLabel('Precio de Masaje').fill('400');
      assert.equal(await page.locator('#total-cobro').textContent(), '$1050');
      await page.locator('.cobro-group-name').evaluate(el => { el.textContent = 'Masaje relajante de espalda y cuerpo completo'; });
      const layout = await page.evaluate(() => {
        const group = document.querySelector('.cobro-group').getBoundingClientRect();
        const check = document.querySelector('.cobro-group-check').getBoundingClientRect();
        const row = document.querySelector('.cobro-group-row');
        const scroll = document.querySelector('.cobro-scroll');
        return { checkboxWidth: check.width, fits: [...row.querySelectorAll('input, label')].every(el => { const r = el.getBoundingClientRect(); return r.left >= group.left && r.right <= group.right; }), overflow: scroll.scrollWidth > scroll.clientWidth };
      });
      assert.equal(layout.checkboxWidth, 20);
      assert.equal(layout.fits, true);
      assert.equal(layout.overflow, false);
      await page.screenshot({ path: '/tmp/venus-grouped-checkout-' + width + '.png' });
      await page.evaluate(() => procesarCobroCita('a'));
      const sent = await page.evaluate(() => window.sent);
      assert.equal(sent.totalPaid, 1050); assert.equal(sent.groupItems.length, 2);
      assert.deepEqual(sent.groupItems.map(i => i.price), [650, 400]);
      await page.close();
    }
    console.log('PASS: grouped modal, totals, deselection, price editing and one payment request at desktop/mobile widths');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Prueba real del botón PDF en Chromium, sin API, clientes ni mensajes reales.
// Requiere playwright (como render-sistema-venus-pdf.cjs).
// HTML2PDF_BUNDLE permite usar una copia local del bundle CDN para correr sin red.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

const publicDir = path.resolve(__dirname, '../public');
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venus-skin-pdf-'));
const fixture = {
  id: 'pdf-test', clientName: 'Paciente de prueba', clientPhone: '',
  analyzedAt: '2026-09-06T12:00:00', ageReal: 25, ageBiological: 24,
  skinType: 'Mixta', skinColor: 'Blanca clara', faceShape: 'Ovalada alargada (申)', overallScore: 74,
  scores: Array.from({ length: 13 }, (_, i) => ({
    key: `metric${i}`, labelEs: ['Arrugas', 'Hidratación', 'Daño solar'][i] || `Métrica ${i + 1}`,
    score: i === 0 ? 15 : i < 3 ? 35 : 80, severity: i === 0 ? 'critical' : i < 3 ? 'concern' : 'good',
  })),
  images: Array.from({ length: 9 }, (_, i) => ({
    key: `image${i}`, labelEs: `Captura de prueba ${i + 1}`, originalUrl: 'http://skin.test/assets/logo.png',
  })),
  aiRecommendations: {
    headline: 'Buen estado general con áreas puntuales a fortalecer',
    summary: 'Tu piel conserva una buena textura y colágeno natural. La hidratación moderada también se puede mejorar con una rutina constante.',
    recommendations: [{ treatment: 'Hidratación facial', why: 'Refuerza la barrera cutánea.', sessions: 3, frequency: 'Cada mes' }],
    homeCare: ['Limpieza suave por la mañana.', 'Protector solar todos los días.'],
    nextAnalysisWeeks: 6,
  },
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  try {
    for (const width of [390, 794, 1440, 1920]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true });
      const errors = [];
      let failImages = false;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/skin-analysis/pdf-test') return route.fulfill({ json: { success: true, data: fixture } });
        if (url.pathname === '/api/skin-analysis/image-proxy') {
          return failImages ? route.fulfill({ status: 403, body: 'dominio no permitido' })
            : route.fulfill({ path: path.join(publicDir, 'assets/logo.png') });
        }
        if (url.hostname === 'skin.test') {
          const file = path.join(publicDir, url.pathname);
          if (fs.existsSync(file)) return route.fulfill({ path: file });
        }
        if (url.pathname.endsWith('/html2pdf.bundle.min.js')) {
          return process.env.HTML2PDF_BUNDLE
            ? route.fulfill({ path: process.env.HTML2PDF_BUNDLE })
            : route.continue();
        }
        // Fuentes e iconos no intervienen en la prueba de coordenadas de captura.
        return route.fulfill({ body: '', contentType: 'text/plain' });
      });
      await page.goto('http://skin.test/skin-analysis.html?view=pdf-test');
      await page.waitForFunction(() => document.querySelector('#d-name').textContent === 'Paciente de prueba');
      await page.evaluate(() => {
        const workerPrototype = window.html2pdf.Worker.prototype;
        const toPdf = workerPrototype.toPdf;
        workerPrototype.toPdf = function (...values) {
          return toPdf.apply(this, values).then(function () {
            window.pdfTest = { pages: this.prop.pdf.getNumberOfPages() };
            const canvas = this.prop.canvas;
            const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, Math.floor(canvas.width * 297 / 210));
            let minX = canvas.width, maxX = 0;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i + 3] && Math.min(data[i], data[i + 1], data[i + 2]) < 220) {
                const x = (i / 4) % canvas.width;
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
              }
            }
            Object.assign(window.pdfTest, { minX, maxX, width: canvas.width });
          });
        };
        // Simula el receptor del archivo; nunca abre ni envía una conversación.
        navigator.canShare = () => true;
        navigator.share = async ({ files }) => { window.sharedPdfSize = files[0].size; };
      });
      for (const mode of ['download', 'share']) {
        const button = page.locator(`#btn-${mode}-pdf`);
        await button.scrollIntoViewIfNeeded();
        const scrollBefore = await page.evaluate(() => window.scrollY);
        const downloadPromise = mode === 'download' ? page.waitForEvent('download') : null;
        await button.click();
        if (downloadPromise) await (await downloadPromise).saveAs(path.join(outputDir, `skin-${width}.pdf`));
        await page.waitForFunction(() => !document.querySelector('#btn-download-pdf').disabled && !document.querySelector('#btn-share-pdf').disabled);
        const result = await page.evaluate(() => ({
          ...window.pdfTest, sharedPdfSize: window.sharedPdfSize, scroll: window.scrollY,
          sheets: document.querySelectorAll('#pdf-pages > .pdf-page').length,
          loadedImages: [...document.querySelectorAll('#pdf-pages .pdf-gallery-item img')].filter(img => img.complete && img.naturalWidth > 0).length,
          overlap: [...document.querySelectorAll('#pdf-pages > .pdf-page')].some(p =>
            p.querySelector('.pdf-page-body').getBoundingClientRect().bottom > p.querySelector('.pdf-footer').getBoundingClientRect().top),
        }));
        assert.ok(result.sheets >= 3, 'El reporte debe probar varias hojas y capturas');
        assert.equal(result.pages, result.sheets, 'No debe haber páginas adicionales');
        assert.equal(result.loadedImages, fixture.images.length, 'Todas las capturas deben estar cargadas');
        assert.ok(result.minX > 70 && result.maxX < result.width - 70, 'Ambos márgenes deben conservarse en la imagen exportada');
        assert.equal(result.overlap, false, 'El contenido no debe tapar el pie de página');
        assert.ok(Math.abs(result.scroll - scrollBefore) <= 1, 'Debe restaurar el scroll');
        if (mode === 'share') assert.ok(result.sharedPdfSize > 10000, 'Compartir debe generar un PDF');
        assert.deepEqual(errors, []);
        console.log(`OK ${width}px ${mode}: ${result.pages} hojas, márgenes completos`);
      }
      if (width === 390) {
        failImages = true;
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#d-name').textContent === 'Paciente de prueba');
        let downloaded = false;
        page.on('download', () => { downloaded = true; });
        await page.locator('#btn-download-pdf').click();
        await page.waitForFunction(() => document.querySelector('#d-feedback').textContent.includes('No se pudo cargar la imagen'));
        assert.equal(downloaded, false, 'No debe descargar un PDF sin las imágenes');
        assert.equal(await page.locator('#btn-download-pdf').isEnabled(), true);
        console.log('OK imagen fallida: error visible, descarga incompleta bloqueada');
      }
      await page.close();
    }
    console.log(`PDFs de prueba: ${outputDir}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

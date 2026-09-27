const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  try {
    const src = fs.readFileSync('public/admin.html', 'utf8');
    const start = src.indexOf('<section id="tab-reports"');
    const html = src.slice(start, src.indexOf('</section>\n\n    <!--', start) + 10).replace('tab-content hidden', 'tab-content');
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.setContent('<html data-theme="light"><body>' + html + '</body></html>');
      for (const file of ['admin/admin-base.css', 'admin/admin-extra.css', 'admin/admin-redesign.css', 'admin/admin-mobile.css', 'sales-layout.css']) {
        await page.addStyleTag({ content: fs.readFileSync('public/css/' + file, 'utf8') });
      }
      await page.addScriptTag({ path: 'public/js/sales-layout.js' });
      await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js' });
      const chartStart = src.indexOf('function renderIngresosEgresosChart(');
      const chartEnd = src.indexOf('function renderExcelTable(', chartStart);
      await page.addScriptTag({ content: 'let reportPieChart, reportServicesPieChart; const SERVICE_COLORS=["#576429","#9cae7a","#bc7c55"]; function getChartBorderColor(){return "#fafbf8";}\n' + src.slice(chartStart, chartEnd) });
      await page.evaluate(() => {
        renderIngresosEgresosChart(48650, 12300);
        renderServicesChart([['Faciales',24800],['Depilacion',14250],['Masajes',9600]]);
        for (const [id,value] of Object.entries({'report-total-ingresos':'$48,650','report-total-egresos':'$12,300','report-utilidad':'$36,350','report-sales-count':'74','report-current-month':'Septiembre 2026'})) document.getElementById(id).textContent=value;
      });
      assert.equal(await page.locator('.sales-headline-metric').count(), 4);
      assert.equal(await page.locator('.sales-overview canvas').count(), 2);
      await page.getByRole('button', {name:'Detalle fiscal'}).click();
      assert.equal(await page.locator('.sales-ledger').evaluate(el=>el.classList.contains('sales-fiscal-visible')), true);
      await page.getByRole('button', {name:'Detalle fiscal'}).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth), false);
      await page.waitForTimeout(800);
      console.log(await page.evaluate(()=>{const r=document.getElementById('tab-reports');return {height:r.getBoundingClientRect().height,background:getComputedStyle(r).backgroundColor,body:getComputedStyle(document.body).height};}));
      await page.screenshot({path:'/tmp/venus-approved-sales-'+width+'.png',fullPage:true});
      console.log('PASS', width); await page.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

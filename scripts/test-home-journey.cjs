const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  try {
    const source = fs.readFileSync('public/admin.html','utf8');
    const start = source.indexOf('<section id="tab-overview"');
    const html = source.slice(start,source.indexOf('<section id="tab-',start+20));
    for (const width of [1440,390,320]) {
      const page = await browser.newPage({viewport:{width,height:950}});
      await page.setContent('<html data-theme="light"><body>'+html+'</body></html>');
      for (const file of ['admin/admin-base.css','admin/admin-extra.css','admin/admin-redesign.css','admin/admin-mobile.css','home-layout.css']) await page.addStyleTag({content:fs.readFileSync('public/css/'+file,'utf8')});
      await page.addStyleTag({content:'body,html{height:auto!important;overflow:auto!important}'});
      await page.evaluate(() => { window.apiFetch = async () => ({ok:true,json:async()=>({success:true,data:[]})}); });
      await page.addScriptTag({path:'public/js/home-journey.js'});
      await page.evaluate(()=>window.loadHomeJourney());
      await page.waitForTimeout(350);
      const layout = await page.evaluate(()=>{
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        return {agenda:rect('.journey-agenda').top,pending:rect('.admin-clarity-grid').top,month:rect('.hero-stats').top,activity:rect('.journey-activity').top,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(layout.overflow,false);
      if(width>900){assert.ok(Math.abs(layout.agenda-layout.pending)<2);assert.ok(Math.abs(layout.month-layout.activity)<2);assert.ok(layout.month<750);}
      assert.equal(await page.locator('.journey-secondary').getAttribute('open'),null);
      await page.screenshot({path:'/tmp/venus-jornada-fixed-'+width+'.png',fullPage:true});
      await page.locator('.journey-secondary summary').click();
      assert.equal(await page.locator('.journey-secondary').evaluate(el=>el.open),true);
      console.log('PASS',width,layout); await page.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

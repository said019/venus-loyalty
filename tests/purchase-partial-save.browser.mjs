import express from 'express';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const line=(id,name)=>({id,description:name,sku:id,quantity:3,assignedQuantity:0,allocations:[],netTotalCents:9000,volumeNote:''});
const lines=[line('bio','Bio Oxi'),line('gel','Gel bloqueador solar')],sent=[];
const app=express();app.use(express.json());
app.get('/api/purchase-invoices',(_,res)=>res.json({success:true,data:[{id:'invoice',number:'TEST',supplier:'Proveedor',lines}]}));
for(const path of ['/api/products','/api/clinic-inventory'])app.get(path,(_,res)=>res.json({success:true,data:[]}));
app.post('/api/purchase-invoices/lines/:id/redistribute',(req,res)=>{
 sent.push(req.params.id);const row=lines.find(l=>l.id===req.params.id);
 res.json({success:true,data:{line:{...row,assignedQuantity:Number(req.body.saleQuantity)+Number(req.body.clinicQuantity)},allocations:[]}});
});
app.use(express.static('public'));
app.get('/test',(_,res)=>res.send('<div id="panel-invoices"></div><script src="/js/purchase-grid.js"></script><script>purchaseGrid.load()</script>'));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/test`);
 const bio=page.locator('tbody tr').nth(0),gel=page.locator('tbody tr').nth(1);
 await bio.locator('[data-field=saleQuantity]').fill('3');await bio.locator('[data-field=price]').fill('550');
 await gel.locator('[data-field=clinicQuantity]').fill('1');
 await page.fill('#pg-search','oxi');
 await page.click('#pg-save');
 await page.waitForFunction(()=>document.querySelector('#pg-status').textContent.includes('1 fila(s) guardadas'));
 assert.deepEqual(sent,['bio']);assert.match(await page.locator('#pg-status').textContent(),/Gel bloqueador solar: Falta el contenido en ml/);
 await page.locator('#pg-status button').click();assert(await gel.isVisible());
 assert.equal(await gel.locator('[data-field=clinicQuantity]').inputValue(),'1');
 await gel.locator('[data-field=bottleMl]').fill('50');await gel.locator('[data-field=volumeConfirmed]').check();
 await page.click('#pg-save');await page.waitForFunction(()=>document.querySelector('#pg-status').textContent==='1 fila(s) guardadas.');
 assert.deepEqual(sent,['bio','gel']);
 assert.equal(await page.locator('#pg-status button').count(),0);
 console.log('PASS partial save: valid row saved, hidden invalid product named, edits retained, corrected retry does not resend saved row');
}finally{await browser.close();await new Promise(r=>server.close(r));}

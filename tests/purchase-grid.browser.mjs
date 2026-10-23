import {readFileSync} from 'node:fs';
import express from 'express';import cookieParser from 'cookie-parser';import jwt from 'jsonwebtoken';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
assert(process.env.CLINIC_TEST_DATABASE_URL);assert(['localhost','127.0.0.1'].includes(new URL(process.env.CLINIC_TEST_DATABASE_URL).hostname));process.env.DATABASE_URL=process.env.CLINIC_TEST_DATABASE_URL;process.env.ADMIN_JWT_SECRET='local-test';
const {prisma}=await import('../src/db/index.js');const {default:router}=await import('../src/routes/purchaseInvoices.js');const {default:clinic}=await import('../src/routes/clinicInventory.js');
const id=randomUUID();const invoice=await prisma.purchaseInvoice.create({data:{id,number:'TEST-UI',supplier:'Proveedor de prueba',issuedOn:'2026-10-20',subtotalCents:10000,discountCents:0,taxCents:1600,totalCents:11600,sourceFilename:'test.pdf',sourceHash:id,sourcePdf:Buffer.from('%PDF-test'),lines:{create:{lineNumber:1,sku:'TEST',description:'Crema de prueba 50 GR',quantity:2,netTotalCents:11600,listUnitCents:10000,volumeNote:'Presentación en gramos. Confirmar el volumen real.'}}},include:{lines:true}});
const adminHead=readFileSync('public/admin.html','utf8');
const adminStyles=(adminHead.match(/<style[\s\S]*?<\/style>|<link[^>]*>/g)||[]).filter(s=>s.startsWith('<style')||(s.includes('stylesheet')&&!s.includes('https://'))).join('');
const app=express();app.use(express.json(),cookieParser());app.use('/api/purchase-invoices',router);app.use('/api/clinic-inventory',clinic);app.get('/api/products',async(req,res)=>res.json({success:true,data:await prisma.product.findMany()}));app.use(express.static('public'));
app.get('/test-ui',(req,res)=>res.send(`<!doctype html><html data-theme="light"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/clinic-inventory.css"><style>:root{--bg:#faf7f1;--bg-card:#fffdf8;--ink:#263123;--muted:#68705f;--line:#d9d7ca;--venus:#596329}*{box-sizing:border-box}body{margin:0;padding:20px;background:var(--bg);color:var(--ink);font-family:Arial}.btn{padding:12px 16px;border:1px solid var(--line);border-radius:10px;background:var(--bg-card);color:var(--ink);font-weight:600}.btn.primary{background:var(--venus);color:white}</style>${adminStyles}<div id="panel-invoices"></div><script src="/js/purchase-grid.js"></script><script>purchaseGrid.load();</script>`));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 assert.equal((await fetch(base+'/api/purchase-invoices')).status,401);
 const reception=jwt.sign({uid:'test',role:'recepcion'},process.env.ADMIN_JWT_SECRET);
 assert.equal((await fetch(base+'/api/purchase-invoices',{headers:{cookie:`adm=${reception}`}})).status,403);
 assert.equal((await fetch(base+'/api/purchase-invoices/'+id+'/pdf')).status,401);
 const page=await browser.newPage({viewport:{width:390,height:900}});await page.context().addCookies([{name:'adm',value:jwt.sign({uid:'test',email:'test',role:'admin'},process.env.ADMIN_JWT_SECRET),url:base}]);
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/test-ui');
 const row=page.locator('tbody tr').filter({has:page.locator('input[value="Crema de prueba 50 GR"]')});
 assert.match(await row.locator('.pg-original').textContent(),/100.00/);assert.match(await row.locator('.pg-discount').textContent(),/42%/);assert.match(await row.locator('.pg-cost').textContent(),/58.00/);assert.equal(await row.locator('[data-field=price]').inputValue(),'');
 await row.locator('[data-field=saleQuantity]').fill('1');await row.locator('[data-field=price]').fill('120');
 await row.locator('[data-field=clinicQuantity]').fill('1');await row.locator('[data-field=bottleMl]').fill('45.5');
 await row.locator('[data-field=volumeConfirmed]').check();
 const checkbox=await row.locator('[data-field=volumeConfirmed]').boundingBox();assert(checkbox.width<=18 && checkbox.height<=18);
 const rowBox=await row.boundingBox();assert(rowBox.height<170);
 await page.locator('.pg-scroll').evaluate(el=>el.scrollTop=0);
 const header=await page.locator('.pg-table th').first().evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
 function luminance(rgb){const values=rgb.match(/\d+/g).slice(0,3).map(v=>Number(v)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
 const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
 assert(contrast(header.fg,header.bg)>=4.5);
 await page.screenshot({path:'/tmp/purchase-grid-desktop.png'});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 const dark=await page.locator('.pg-table th').first().evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));assert(contrast(dark.fg,dark.bg)>=4.5);
 await page.evaluate(()=>document.documentElement.dataset.theme='light');
 let sent;page.on('request',r=>{if(r.url().endsWith('/redistribute'))sent=r.postDataJSON()});
 await page.getByRole('button',{name:'Guardar cambios'}).click();await page.locator('#pg-status').filter({hasText:'1 fila(s) guardadas.'}).waitFor();
 const line=await prisma.purchaseInvoiceLine.findUnique({where:{id:invoice.lines[0].id},include:{allocations:true}});
 assert.equal(line.assignedQuantity,2);assert.equal(line.retailUnitCents,12000);assert.equal(line.allocations.length,2);
 const product=line.allocations.find(a=>a.destination==='sale');const supply=line.allocations.find(a=>a.destination==='clinic');
 assert.equal((await prisma.product.findUnique({where:{id:product.targetId}})).stock,1);
 assert.equal((await prisma.clinicSupply.findUnique({where:{id:supply.targetId}})).stockMilliMl,45500);
 const repeat=await page.request.post(base+'/api/purchase-invoices/lines/'+line.id+'/redistribute',{data:sent});assert.equal(repeat.status(),200);
 assert.equal((await prisma.product.findUnique({where:{id:product.targetId}})).stock,1);
 assert.equal((await prisma.clinicSupply.findUnique({where:{id:supply.targetId}})).stockMilliMl,45500);
 await row.locator('[data-field=price]').fill('130');await page.getByRole('button',{name:'Guardar cambios'}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('tbody tr')].find(r=>r.querySelector('[data-field=name]').value==='Crema de prueba 50 GR').querySelector('.pg-row-status').textContent==='Guardado');
 assert.equal(Number((await prisma.product.findUnique({where:{id:product.targetId}})).price),130);
 assert.equal(await row.locator('[data-field=saleQuantity]').inputValue(),'1');
 assert.equal(await row.locator('[data-field=clinicQuantity]').inputValue(),'1');
 await row.locator('[data-field=saleQuantity]').fill('2');
 await row.locator('[data-field=clinicQuantity]').fill('0');
 await page.getByRole('button',{name:'Guardar cambios'}).click();
 await page.waitForFunction(()=>document.querySelector('.pg-row-status').textContent==='Guardado');
 assert.equal((await prisma.product.findUnique({where:{id:product.targetId}})).stock,2);
 assert.equal((await prisma.clinicSupply.findUnique({where:{id:supply.targetId}})).stockMilliMl,0);
 await page.reload();
 await row.locator('[data-field=saleQuantity]').waitFor();
 assert.equal(await row.locator('[data-field=saleQuantity]').inputValue(),'2');
 assert.equal(await row.locator('[data-field=clinicQuantity]').inputValue(),'0');
 assert(await row.locator('[data-field=clinicQuantity]').isEnabled());
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:'/tmp/purchase-grid-mobile.png'});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const width of [390,800,1100,1440]){
  await page.setViewportSize({width,height:1000});
  assert(await page.locator('.pg-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`Table overflows at ${width}`);
  const ml=await row.locator('[data-field=bottleMl]').boundingBox();assert(ml.x>=0 && ml.x+ml.width<=width);
 }
 await page.setViewportSize({width:800,height:1000});await page.screenshot({path:'/tmp/purchase-grid-fit.png'});
 console.log('Grid passed: inline split, price, ml, atomic save, retry without duplicate stock, mobile containment, admin access.');

}finally{
 await browser.close();const allocations=await prisma.purchaseAllocation.findMany({where:{lineId:invoice.lines[0].id}});
 for(const a of [...new Map(allocations.map(a=>[a.destination+':'+a.targetId,a])).values()]){if(a.destination==='sale')await prisma.product.delete({where:{id:a.targetId}});if(a.destination==='clinic'){await prisma.clinicStockMovement.deleteMany({where:{supplyId:a.targetId}});await prisma.clinicSupply.delete({where:{id:a.targetId}});}}
 const audit=(await prisma.setting.findMany({where:{key:{startsWith:'purchase-correction:'}}})).filter(s=>s.value.line.id===invoice.lines[0].id);
 await prisma.setting.deleteMany({where:{key:{in:audit.map(s=>s.key)}}});
 await prisma.purchaseAllocation.deleteMany({where:{lineId:invoice.lines[0].id}});await prisma.purchaseInvoiceLine.delete({where:{id:invoice.lines[0].id}});await prisma.purchaseInvoice.delete({where:{id}});await new Promise(r=>server.close(r));await prisma.$disconnect();
}

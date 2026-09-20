import { chromium } from '/Users/saidromero/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try {
 for(const width of [390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:1000},permissions:['camera']});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{
   const url=route.request().url();let body={success:true};
   if(url.includes('cards-firebase'))body={items:[{id:'test-card',name:'Clienta de prueba',phone:'0000000000'}]};
   if(url.includes('client-records/card/'))body={data:{id:'test-record',photos:[]}};
   if(route.request().method()==='POST'&&url.endsWith('/photos'))body={data:{id:'test-photo',url:'https://example.test/photo.jpg'}};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:4319/captura.html');
  await page.locator('#q').fill('Clienta');await page.locator('#resultados button').click();
  await page.waitForFunction(()=>!document.getElementById('b-tomar').disabled);
  assert(await page.locator('.app-header img').evaluate(img=>img.complete&&img.naturalWidth>0));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
  await page.screenshot({path:`/tmp/venus-capture-redesign-${width}.png`,fullPage:true,animations:'disabled'});
  await page.locator('#b-tomar').click();
  await page.waitForFunction(()=>document.getElementById('photo-count').textContent==='1 fotografía');
  assert(await page.locator('#b-analizar').isEnabled());
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(`PASS layout, logo, camera, mock upload and analysis action ${width}px`);
  await context.close();
 }
 const nativeContext=await browser.newContext({viewport:{width:1080,height:1000},permissions:['camera'],userAgent:'Mozilla/5.0 VenusMoji/0.8.2 VenusNativeStill/1'});
 await nativeContext.addInitScript(()=>{
  const stop=MediaStreamTrack.prototype.stop;
  MediaStreamTrack.prototype.stop=function(){const ended=this.onended;stop.call(this);if(ended)ended.call(this,new Event('ended'));};
 });
 const nativePage=await nativeContext.newPage();let uploaded=false;
 const jpeg=await nativePage.screenshot({type:'jpeg'});
 await nativePage.route('**/__native-capture/*.jpg',r=>r.fulfill({contentType:'image/jpeg',body:jpeg}));
 await nativePage.route('**/api/**',route=>{
  const url=route.request().url();let body={success:true};
  if(url.includes('cards-firebase'))body={items:[{id:'native-card',name:'Prueba nativa'}]};
  if(url.includes('client-records/card/'))body={data:{id:'native-record',photos:[]}};
  if(route.request().method()==='POST'&&url.endsWith('/photos')){
   assert(route.request().postDataBuffer().includes(jpeg),'Original native bytes must reach upload unchanged');uploaded=true;
   body={data:{id:'native-photo',url:'https://example.test/photo.jpg'}};
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await nativePage.goto('http://127.0.0.1:4319/captura.html');
 await nativePage.locator('#q').fill('Prueba');await nativePage.locator('#resultados button').click();
 await nativePage.waitForFunction(()=>!document.getElementById('b-tomar').disabled);
 await nativePage.locator('#b-tomar').click();
 await nativePage.evaluate(()=>window.venusNativeStillResult({request:1,ok:true}));
 await nativePage.waitForFunction(()=>document.getElementById('photo-count').textContent==='1 fotografía');
 assert(uploaded);await nativePage.waitForFunction(()=>!document.getElementById('b-tomar').disabled);
 console.log('PASS mocked native JPEG handoff preserves original bytes and restarts preview');
 await nativeContext.close();
}finally{await browser.close();}

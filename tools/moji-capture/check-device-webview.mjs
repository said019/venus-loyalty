import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const targets=await (await fetch('http://127.0.0.1:19223/json')).json();
assert.equal(targets.length,1);
const ws=new WebSocket(targets[0].webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let next=0;const waiting=new Map();
ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id&&waiting.has(message.id)){const p=waiting.get(message.id);waiting.delete(message.id);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}});
function rpc(method,params={}){return new Promise((resolve,reject)=>{const id=++next;waiting.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(source){const r=await rpc('Runtime.evaluate',{expression:`(async function(){${source}})()`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(source){const deadline=Date.now()+18000;while(Date.now()<deadline){if(await evaluate(`return ${source}`))return;await new Promise(r=>setTimeout(r,150));}throw new Error('Timed out: '+source);}
async function tap(selector){const point=await evaluate(`var b=document.querySelector(${JSON.stringify(selector)});b.scrollIntoView({block:'center'});var r=b.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};`);await rpc('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});await rpc('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});}
const deadline=setTimeout(()=>{console.error('FAIL diagnostic timeout');ws.close();process.exit(1);},45000);
try{
 await rpc('Runtime.enable');
 const html=await readFile('public/captura.html','utf8'),css=await readFile('public/moji-capture.css','utf8');
 await evaluate(`document.body.innerHTML=new DOMParser().parseFromString(${JSON.stringify(html)},'text/html').body.innerHTML;var style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.appendChild(style);
 window.__originalFetch=window.__originalFetch||window.fetch;window.__uploaded=null;window.__uploadCount=0;
 window.fetch=function(url,options){
  var path=String(url);if(path.indexOf('/api/')!==0)return window.__originalFetch(url,options);
  var data={success:true};
  if(path.indexOf('cards-firebase')!==-1)data={items:[{id:'diagnostic-card',name:'Prueba local sin expediente'}]};
  if(path.indexOf('client-records/card/')!==-1)data={data:{id:'diagnostic-record',photos:[]}};
  if(options&&options.method==='POST'&&path.indexOf('/photos')!==-1){var photo=options.body.get('photo');window.__uploaded={bytes:photo.size,type:photo.type};data={data:{id:'diagnostic-photo-'+(++window.__uploadCount)}};}
  return Promise.resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
 };return true;`);
 for(const name of ['moji-capture-flow.js','moji-import.js','moji-capture.js'])await evaluate(await readFile('public/'+name,'utf8'));
 await evaluate(`var q=document.getElementById('q');q.value='Prueba';q.dispatchEvent(new Event('input'));return true;`);
 await until(`document.querySelector('#resultados button')`);await tap('#resultados button');
 await until(`!document.getElementById('b-tomar').disabled`);
 await tap('#b-tomar');
 await until(`window.__uploaded || document.getElementById('e-tomar').classList.contains('mal')`);
 const result=await evaluate(`return {uploaded:window.__uploaded,status:document.getElementById('e-tomar').textContent,format:document.getElementById('capture-format').textContent,ua:navigator.userAgent};`);
 console.log(JSON.stringify(result,null,2));assert(result.uploaded&&result.uploaded.bytes>1000000,'Native JPEG did not reach mocked upload');
 await until(`!document.getElementById('b-tomar').disabled`);
 await evaluate(`window.__uploaded=null;return true;`);
 await tap('#b-tomar');
 await until(`window.__uploaded || document.getElementById('e-tomar').classList.contains('mal')`);
 const second=await evaluate(`return {uploaded:window.__uploaded,count:document.getElementById('photo-count').textContent,status:document.getElementById('e-tomar').textContent};`);
 console.log(JSON.stringify(second,null,2));assert(second.uploaded&&second.uploaded.bytes>1000000,'Repeated native capture failed');
 await until(`document.getElementById('photo-count').textContent==='2 fotografías' && !document.getElementById('b-tomar').disabled`);
 if(process.env.MOJI_TEST_REAL_WHITE!=='1'){
  await tap('#b-tomar');
  await new Promise(r=>setTimeout(r,150));
  const cancelledAt=Date.now();
  await evaluate(`location.href='venus-moji://off';return true;`);
  await until(`document.getElementById('e-tomar').textContent.indexOf('Captura cancelada.')!==-1`);
  assert(Date.now()-cancelledAt<3000,'Native cancellation should not wait for the 13-second web timeout');
  assert.equal(await evaluate(`return window.__uploadCount;`),2,'Cancelled capture must not upload');
  await until(`!document.getElementById('b-tomar').disabled`);
  console.log('PASS native OFF immediately cancels pending capture without upload');
 }
 console.log('PASS physical Android WebView gesture -> native JPEG -> mocked upload -> preview restart; GPIO '+(process.env.MOJI_TEST_REAL_WHITE==='1'?'real white, operator confirmation pending':'simulated'));
}finally{clearTimeout(deadline);try{await evaluate(`document.getElementById('b-cambiar').click();return true;`);}catch{}ws.close();}

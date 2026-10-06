import { cardAmounts, expectedSettlement, isCard, mexicoDay } from './card-settlement-core.js';
const money = cents => (cents/100).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const dateLabel = day => new Date(`${day}T12:00:00-06:00`).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City',weekday:'long',day:'numeric',month:'short',year:'numeric'});
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusLabel = {pending:'Por depositar',verify:'Revisar en banco',received:'Recibido'};
let rows=[],range=null,request=0,busy=false;
const panel=document.getElementById('card-settlements');
function notice(text){const el=document.getElementById('cs-notice');el.textContent=text;el.hidden=!text;}
export function preview(id,parts,paidAt=new Date()) {
  const el=document.getElementById(id);if(!el)return;
  const cardParts=parts.filter(p=>isCard(p.method)&&Number(p.amount)>0).map(p=>cardAmounts(p.amount));
  el.hidden=!cardParts.length;if(!cardParts.length){el.replaceChildren();return;}
  const gross=cardParts.reduce((s,p)=>s+p.grossCents,0),fee=cardParts.reduce((s,p)=>s+p.feeCents,0);
  el.innerHTML=`<div class="cs-preview-title">Depósito de tarjeta</div><div class="cs-amount-line"><span>Comisión de terminal · 5%</span><strong>−${money(fee)}</strong></div><div class="cs-amount-line"><span>Neto por recibir</span><strong>${money(gross-fee)}</strong></div><p>Estimado: <strong>${esc(dateLabel(expectedSettlement(paidAt).expectedDate))}, cerca de las 12:00 p. m.</strong></p><small>La comisión se descuenta de tu depósito. El total de la clienta no cambia.</small>`;
}
function ticketDetails(r) {
  const items = Array.isArray(r.items) ? r.items : [];
  const lines = items.map(p => `<li><span>${esc(p.quantity)} × ${esc(p.name)}${p.unitPriceCents == null ? '' : ` <small>(${money(p.unitPriceCents)} c/u)</small>`}${p.note ? `<small>${esc(p.note)}</small>` : ''}</span><b>${p.totalCents == null ? '—' : money(p.totalCents)}</b></li>`).join('');
  return `${items.length ? `<ul class="cs-ticket-items" aria-label="Artículos del cobro">${r.serviceCents > 0 ? `<li><span>${esc(r.concept)}</span><b>${money(r.serviceCents)}</b></li>` : ''}${lines}</ul>` : '<small>Este registro no tiene artículos detallados guardados.</small>'}${r.discountCents > 0 ? `<small>Descuento del ticket: −${money(r.discountCents)}</small>` : ''}<small>Hora: ${esc(new Date(r.paidAt).toLocaleTimeString('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit'}))} · ${esc(window.etiquetaMetodoPago?.(r.method) || r.method || 'Tarjeta')}</small><small class="cs-reference">Referencia: ${esc(r.key)}</small>`;
}
function render(){
  const pending=rows.filter(r=>r.status!=='received'),received=rows.filter(r=>r.status==='received');
  const sum=(list,key)=>list.reduce((s,r)=>s+r[key],0);
  document.getElementById('cs-pending').textContent=money(sum(pending,'netCents'));
  document.getElementById('cs-received').textContent=money(sum(received,'netCents'));
  document.getElementById('cs-fees').textContent=money(sum(rows,'feeCents'));
  document.getElementById('cs-gross').textContent=`${money(sum(rows,'grossCents'))} cobrados con tarjeta · ${rows.length} cobros`;
  const scope=document.getElementById('cs-status').value;
  const visible=rows.filter(r=>scope==='all'||(scope==='received'?r.status==='received':r.status!=='received'));
  const groups=Map.groupBy?Map.groupBy(visible,r=>r.expectedDate):visible.reduce((m,r)=>{m.set(r.expectedDate,[...(m.get(r.expectedDate)||[]),r]);return m;},new Map());
  const list=document.getElementById('cs-list');
  if(!visible.length){list.innerHTML=`<p class="cs-empty">${rows.length?'No hay depósitos en este estado.':'No hay cobros con tarjeta en este rango.'}</p>`;return;}
  list.innerHTML=[...groups].map(([date,items])=>{
    const pendingItems=items.filter(r=>r.status!=='received');
    const state=pendingItems.some(r=>r.status==='verify')?'verify':pendingItems.length?'pending':'received';
    return `<article class="cs-batch"><div class="cs-batch-head"><div><span class="cs-kicker">Depósito estimado</span><h4>${esc(dateLabel(date))}</h4><p>Cerca de las 12:00 p. m. · ${items.length} cobros</p></div><div class="cs-batch-total"><strong>${money(sum(items,'netCents'))}</strong><span class="cs-status cs-${state}">${statusLabel[state]}</span></div></div><div class="cs-breakdown"><span>Cobrado <b>${money(sum(items,'grossCents'))}</b></span><span>Comisión 5% <b>−${money(sum(items,'feeCents'))}</b></span></div><div class="cs-batch-actions">${pendingItems.length?`<button type="button" class="btn primary" data-cs-action="confirm" data-cs-date="${date}" ${busy?'disabled':''}>Confirmar ${money(sum(pendingItems,'netCents'))} recibidos</button>`:''}</div><details><summary>Ver cobros incluidos</summary><div class="cs-payments">${items.map(r=>`<div class="cs-payment"><div><strong>${esc(r.label)}</strong><span>${esc(r.concept)}</span>${ticketDetails(r)}<small>Cobro: ${esc(dateLabel(mexicoDay(r.paidAt)))}${r.estimatedPaymentDate?' · fecha histórica estimada':''}</small><small>${money(r.grossCents)} − ${money(r.feeCents)} de comisión</small>${r.confirmedAt?`<small>Confirmado el ${esc(dateLabel(mexicoDay(r.confirmedAt)))} por ${esc(r.confirmedBy)}</small>`:''}</div><div class="cs-payment-right"><b>${money(r.netCents)}</b><span class="cs-status cs-${r.status}">${statusLabel[r.status]}</span><button type="button" class="btn ghost small" data-cs-action="${r.status==='received'?'reopen':'confirm'}" data-cs-key="${esc(r.key)}" ${busy?'disabled':''}>${r.status==='received'?'Deshacer confirmación':'Confirmar recibido'}</button></div></div>`).join('')}</div></details></article>`;
  }).join('');
}
export async function load(from,to){
  if(!panel)return;
  if(!from||!to){from=document.getElementById('cs-from').value;to=document.getElementById('cs-to').value;}
  if(!from||!to)return;
  if(busy)return;
  const token=++request;range={from,to};
  document.getElementById('cs-from').value=from;document.getElementById('cs-to').value=to;
  notice('');panel.setAttribute('aria-busy','true');
  document.getElementById('cs-list').innerHTML='<p class="cs-empty">Cargando depósitos…</p>';
  try{
    const res=await window.apiFetch(`/api/card-settlements?${new URLSearchParams({from,to})}`),json=await res.json();
    if(token!==request)return;
    if(!res.ok||!json.success)throw Error(json.error||'No se pudieron cargar los depósitos.');
    rows=json.data;render();
  }catch(e){if(token!==request)return;rows=[];document.getElementById('cs-list').innerHTML='';for(const id of ['cs-pending','cs-received','cs-fees'])document.getElementById(id).textContent='—';document.getElementById('cs-gross').textContent='';notice(e.message);}
  finally{if(token===request)panel.setAttribute('aria-busy','false');}
}
async function act(button){
  if(busy||panel.getAttribute('aria-busy')==='true')return;
  const action=button.dataset.csAction;
  const selected=rows.filter(r=>button.dataset.csKey?r.key===button.dataset.csKey:r.expectedDate===button.dataset.csDate&&r.status!=='received');
  if(!selected.length)return;
  const amount=selected.reduce((s,r)=>s+r.netCents,0);
  busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
    const message=action==='confirm'?`¿Ya verificaste en tu banco el depósito de ${money(amount)} correspondiente a estos ${selected.length} cobros? Se marcará como recibido. Esto no consulta tu banco ni modifica los pagos de las clientas.`:`¿Quitar la confirmación de ${money(amount)}? Volverá a quedar pendiente de revisión y se conservará el historial.`;
    if(!await window.venusConfirm(message,{title:action==='confirm'?'Confirmar depósito recibido':'Deshacer confirmación',okLabel:action==='confirm'?'Sí, ya lo recibí':'Deshacer'}))return;
    const res=await window.apiFetch('/api/card-settlements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...range,action,payments:selected.map(({key,grossCents,paidAt})=>({key,grossCents,paidAt}))})});
    const json=await res.json();if(!res.ok||!json.success)throw Error(json.error||'No se pudo guardar.');
    busy=false;await load(range.from,range.to);
    if(!document.getElementById('cs-notice').hidden)notice('La confirmación se guardó, pero no se pudo actualizar el panel. Pulsa Actualizar.');
  }catch(e){notice(e.message);}
  finally{busy=false;panel.querySelectorAll('button').forEach(b=>b.disabled=false);if(document.getElementById('cs-notice').hidden)render();}
}
window.cardSettlements={preview,load};
if(panel){
  panel.addEventListener('click',e=>{const b=e.target.closest('[data-cs-action]');if(b)act(b);});
  document.getElementById('cs-refresh').addEventListener('click',()=>load());
  document.getElementById('cs-status').addEventListener('change',render);
  document.getElementById('cs-90').addEventListener('click',()=>{const now=new Date(),from=new Date(now);from.setUTCDate(from.getUTCDate()-90);load(mexicoDay(from),mexicoDay(now));});
}

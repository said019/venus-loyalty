import {cardAmounts,isCard} from './card-settlement-core.js';
const money = n => (n/100).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const panel = document.getElementById('card-settlements');
let request=0;
export function preview(id,parts) {
 const el=document.getElementById(id);if(!el)return;
 const cards=parts.filter(p=>isCard(p.method)&&Number(p.amount)>0).map(p=>cardAmounts(p.amount));
 el.hidden=!cards.length;
 el.innerHTML=cards.length?`<div class="cs-preview-title">Comisión de tarjeta</div><div class="cs-amount-line"><span>Comisión · 5%</span><strong>−${money(cards.reduce((s,p)=>s+p.feeCents,0))}</strong></div><div class="cs-amount-line"><span>Ingreso neto</span><strong>${money(cards.reduce((s,p)=>s+p.netCents,0))}</strong></div>`:'';
}
if(panel){
 panel.innerHTML='<h3 id="cs-title">Comisiones</h3><div class="cs-metrics"><div><span>Cobrado con tarjeta</span><strong id="commission-gross">—</strong></div><div><span>Comisión · 5%</span><strong id="commission-fee">—</strong></div><div><span>Ingreso neto de tarjeta</span><strong id="commission-net">—</strong></div></div><p>La comisión ya está descontada del resumen de ingresos netos. No se descuenta otra vez como gasto.</p><p id="commission-notice" role="status"></p>';
 const label=document.getElementById('report-total-ingresos')?.previousElementSibling;
 if(label)label.textContent='Ingresos netos después de comisión';
 const sales=document.getElementById('report-total-sales')?.previousElementSibling?.querySelector('span');
 if(sales)sales.textContent='Ingresos netos';
}
export async function load(from,to){
 if(!panel||!from||!to)return;
 const token=++request;
 document.getElementById('commission-notice').textContent='Cargando comisiones…';
 try{
  const response=await window.apiFetch(`/api/card-settlements?${new URLSearchParams({from,to})}`),result=await response.json();
  if(token!==request)return;
  if(!response.ok||!result.success)throw Error(result.error||'No se pudieron cargar las comisiones.');
  for(const [id,key] of [['gross','grossCents'],['fee','feeCents'],['net','netCents']])document.getElementById('commission-'+id).textContent=money(result.data.reduce((s,r)=>s+r[key],0));
  document.getElementById('commission-notice').textContent=`${from} a ${to} · ${result.data.length} cobros`;
 }catch(error){if(token!==request)return;for(const id of ['gross','fee','net'])document.getElementById('commission-'+id).textContent='—';document.getElementById('commission-notice').textContent=error.message;}
}
window.cardSettlements={preview,load};

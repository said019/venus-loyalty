(() => {
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const amount=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
 const money=v=>v==null?'Importe no registrado':v.toLocaleString('es-MX',{style:'currency',currency:'MXN'});
 const methods={efectivo:'Efectivo',tarjeta:'Tarjeta',card:'Tarjeta',tarjeta_credito:'Tarjeta de crédito',tarjeta_debito:'Tarjeta de débito',transferencia:'Transferencia'};
 function render(a){
  const products=Array.isArray(a.productsSold)?a.productsSold:[];
  const row=(label,value)=>`<div class="exp-charge-line"><span>${esc(label)}</span><strong>${esc(money(value))}</strong></div>`;
  const items=products.map(p=>{const qty=amount(p.quantity??p.qty)??1,price=amount(p.price);return row(`${qty} × ${p.name||'Producto'}`,amount(p.subtotal)??(price==null?null:Math.round(qty*price*100)/100));}).join('');
  const discount=amount(a.discountAmount??a.discount)||0,credit=amount(a.creditApplied)||0;
  const paid=amount(a.totalPaid);
  if(paid===null&&!products.length&&!discount&&!credit)return a.status==='completed'?'<p class="exp-charge-note">Importe no registrado</p>':'';
  return `<div class="exp-charge-summary">${items?'<p class="exp-charge-note">Productos incluidos en el cobro</p>'+items:''}${discount?row('Descuento',-discount):''}${credit?row('Apartado aplicado',-credit):''}${row('Cobrado en esta cita',paid)}<p class="exp-charge-note">${esc(methods[a.paymentMethod]||a.paymentMethod||'Método no registrado')}</p></div>`;
 }
 window.clientChargeSummary={render};
})();

(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const money = value => value == null ? 'No registrado' : value.toLocaleString('es-MX', {style:'currency',currency:'MXN'});
  function render(appt) {
    const items = (Array.isArray(appt.productsSold) ? appt.productsSold : []).map(p => {
      const quantity = number(p.quantity ?? p.qty);
      const price = number(p.price);
      const subtotal = number(p.subtotal) ?? (quantity !== null && price !== null ? quantity * price : null);
      return {name:p.name || 'Producto',quantity,price,subtotal};
    });
    const products = items.every(p => p.subtotal !== null) ? items.reduce((s,p) => s+p.subtotal,0) : null;
    const paid = number(appt.totalPaid);
    const discount = number(appt.discountAmount ?? appt.discount) ?? 0;
    const credit = number(appt.creditApplied) ?? 0;
    const service = number(appt.serviceAmount);
    const remainder = paid !== null && products !== null ? Math.round((paid + discount + credit - products)*100)/100 : null;
    const serviceValue = service ?? (remainder !== null && remainder >= 0 ? remainder : null);
    const inferred = service === null && serviceValue !== null;
    const row = (label,value,cls='') => `<div class="pd-total ${cls}"><span>${label}</span><strong>${money(value)}</strong></div>`;
    const methods = {efectivo:'Efectivo',tarjeta:'Tarjeta',tarjeta_credito:'Tarjeta de crédito',tarjeta_debito:'Tarjeta de débito',transferencia:'Transferencia'};
    const date = appt.paidAt ? new Date(appt.paidAt) : null;
    return `<dl class="pd-client"><div><dt>Clienta</dt><dd>${esc(appt.clientName || 'Sin nombre')}</dd></div><div><dt>Servicio</dt><dd>${esc(appt.serviceName || 'No registrado')}</dd></div></dl>
      ${items.length ? `<section class="pd-products"><h4>Productos <span>${items.length}</span></h4><div class="pd-table-wrap"><table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Importe</th></tr></thead><tbody>${items.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.quantity ?? '—'}</td><td>${money(p.price)}</td><td>${money(p.subtotal)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      <section class="pd-summary" aria-label="Resumen de pago">${row(inferred?'Servicio / otros conceptos':'Servicio',serviceValue)}${items.length?row('Productos',products):''}${discount?row('Descuento',-discount):''}${credit?row('Apartado aplicado',-credit):''}${row('Total pagado',paid,'pd-grand')}</section>
      ${inferred?'<p class="pd-note">El importe de servicio / otros conceptos se calcula por diferencia; no viene desglosado en este cobro.</p>':''}
      <div class="pd-meta"><span><i class="fas fa-credit-card" aria-hidden="true"></i> ${esc(methods[appt.paymentMethod] || appt.paymentMethod || 'Método no registrado')}</span><span>${date && Number.isFinite(date.getTime()) ? esc(date.toLocaleString('es-MX',{timeZone:'America/Mexico_City'})) : 'Fecha de pago no registrada'}</span></div>`;
  }
  window.paymentDetailView = {render};
})();

(() => {
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>(Number(v)/100).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
 async function get(url,options){const r=await fetch(url,{credentials:'include',...options});const j=await r.json();if(!r.ok||!j.success){const e=Error(j.error||'No se pudo cargar.');e.status=r.status;throw e;}return j.data;}
 async function load(){
  const panel=document.getElementById('panel-invoices');panel.innerHTML='<p>Cargando productos de tus compras…</p>';
  try{
   const [invoices,sale,clinic]=await Promise.all(['/api/purchase-invoices','/api/products','/api/clinic-inventory'].map(u=>get(u)));
   const lines=invoices.flatMap(i=>i.lines.map(l=>({...l,invoice:i}))).sort((a,b)=>Number(a.description.startsWith('PENDIENTE:'))-Number(b.description.startsWith('PENDIENTE:'))||a.invoice.supplier.localeCompare(b.invoice.supplier,'es')||a.description.localeCompare(b.description,'es'));let saving=false;
   panel.innerHTML=`<div class="ci-toolbar"><div><h3>Productos comprados</h3><p class="ci-muted">Nombres, cantidades y costos cargados de tus comprobantes. Tú eliges el destino y el precio de venta.</p></div><button class="btn primary" id="pg-save">Guardar cambios</button></div><div class="pg-controls"><input id="pg-search" placeholder="Buscar producto o proveedor…" aria-label="Buscar producto o proveedor"><label><input id="pg-pending" type="checkbox"> Solo pendientes</label><span id="pg-count">${lines.length} conceptos · ${lines.reduce((s,l)=>s+l.quantity-l.assignedQuantity,0)} piezas pendientes</span></div><p id="pg-status" role="status" aria-live="polite"></p><div class="pg-scroll"><table class="pg-table"><thead><tr><th>Producto / comprobante</th><th>Compradas<br><small>por asignar</small></th><th>Original<small>antes del descuento</small></th><th>Descuento<small>ahorro por pieza</small></th><th>Te costó<small>por pieza</small></th><th>Para venta<br><small>total asignado</small></th><th>Precio al público<small>lo defines tú</small></th><th>Consultorio<br><small>total asignado</small></th><th>Contenido<br><small>ml / envase</small></th></tr></thead><tbody></tbody></table></div><div class="pg-scroll-hint"><span>Importes en MXN por pieza · Descuento tomado del comprobante</span></div>`;
   panel.querySelector('#pg-pending').closest('label').remove();
   const choices=(items)=>items.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');
   panel.querySelector('#pg-count').insertAdjacentHTML('beforebegin', `
    <label class="pg-filter">Proveedor<select id="pg-supplier"><option value="">Todos</option>${choices([...new Set(invoices.map(i=>i.supplier))].sort((a,b)=>a.localeCompare(b,'es')).map(s=>[s,s]))}</select></label>
    <label class="pg-filter">Factura<select id="pg-invoice"><option value="">Todas</option>${choices(invoices.map(i=>[i.id,`${i.number} · ${i.supplier}`]))}</select></label>
    <label class="pg-filter">Destino<select id="pg-destination"><option value="">Todos</option><option value="sale">Venta</option><option value="clinic">Consultorio</option><option value="both">Ambos</option><option value="none">Sin asignar</option></select></label>
    <label class="pg-filter">Estado<select id="pg-state"><option value="">Todos</option><option value="pending">Con pendientes</option><option value="complete">Todo asignado</option><option value="unpriced">Sin precio</option><option value="dirty">Sin guardar</option></select></label>
    <button type="button" class="btn" id="pg-clear" title="Limpiar filtros">Limpiar filtros</button>`);
   panel.querySelector('#pg-count').setAttribute('aria-live','polite');
   panel.querySelector('.pg-scroll').insertAdjacentHTML('afterend','<p id="pg-empty" class="ci-muted" hidden role="status">No hay productos con estos filtros.</p>');
   const tbody=panel.querySelector('tbody');
   const options=(items,line)=>'<option value="">Crear con el nombre de esta fila</option>'+items.map(p=>`<option value="${esc(p.id)}" ${p.name.trim().toLowerCase()===line.description.trim().toLowerCase()?'selected':''}>${esc(p.name)}</option>`).join('');
   const rows=lines.map(line=>{
    const tr=document.createElement('tr');const pending=line.quantity-line.assignedQuantity;
    const assigned=destination=>(line.allocations||[]).filter(a=>a.destination===destination).reduce((sum,a)=>sum+a.quantity,0);
    const cost=line.netTotalCents/line.quantity,original=line.listUnitCents;
    const unknownCost=cost===0&&/no muestra precio/i.test(line.purchaseNote||'');
    const discount=original>0&&!unknownCost?`<strong>${(100*(1-cost/original)).toLocaleString('es-MX',{maximumFractionDigits:2})}%</strong><small>${money(original-cost)}</small>`:'No indicado';
    tr.innerHTML=`<td><input data-field="name" aria-label="Nombre del producto" value="${line.description.startsWith('PENDIENTE:')?'':esc(line.description)}" placeholder="Facial Vitamina… · nombre tapado en foto" maxlength="150"><small class="pg-source">${esc(line.invoice.supplier)} · <a target="_blank" rel="noopener" href="/api/purchase-invoices/${encodeURIComponent(line.invoice.id)}/pdf">${esc(line.invoice.number)}</a></small><details><summary>Notas y vinculación</summary><div class="pg-details-body"><p>${esc(line.purchaseNote)}</p><p>${esc(line.volumeNote)}</p><label>Sumar venta a<select data-field="saleTargetId">${options(sale,line)}</select></label><label>Sumar consultorio a<select data-field="clinicTargetId">${options(clinic,line)}</select></label><small>El precio escrito se aplicará al producto de venta seleccionado al asignar piezas.</small></div></details><span class="pg-row-status" role="status"></span></td><td><strong class="pg-bought">${line.quantity}</strong><small class="pg-remaining">${pending} pendientes</small></td><td class="pg-original">${original!=null?money(original):'No indicado'}</td><td class="pg-discount">${discount}</td><td class="pg-cost">${unknownCost?'Por confirmar':money(cost)}</td><td><input data-field="saleQuantity" aria-label="Piezas para venta" type="number" min="0" max="${line.quantity}" step="1" value="${assigned('sale')}"></td><td><input data-field="price" aria-label="Precio al público" type="number" min="0.01" max="1000000" step="0.01" value="${line.retailUnitCents?line.retailUnitCents/100:''}" placeholder="$ Sin definir"></td><td><input data-field="clinicQuantity" aria-label="Envases para consultorio" type="number" min="0" max="${line.quantity}" step="1" value="${assigned('clinic')}"></td><td><input data-field="bottleMl" aria-label="Mililitros por envase" type="number" min="0.001" max="1000000" step="0.001" value="${line.suggestedMilliMl?line.suggestedMilliMl/1000:''}" placeholder="ml"><label class="pg-confirm"><input data-field="volumeConfirmed" type="checkbox" ${line.suggestedMilliMl?'checked':''}> ${line.suggestedMilliMl?'Según comprobante':'Confirmo ml'}</label></td>`;
    const labels=['Producto','Compradas / pendientes','Precio original','Descuento','Costo por pieza','Para venta · piezas','Precio al público','Consultorio · envases','Contenido · ml por envase'];
    [...tr.children].forEach((td,i)=>td.dataset.label=labels[i]);
    tbody.appendChild(tr);const fields=Object.fromEntries([...tr.querySelectorAll('[data-field]')].map(el=>[el.dataset.field,el]));
    const row={tr,line,fields,dirty:false,key:null};
    for(const destination of ['sale','clinic']){
     const linked=(line.allocations||[]).filter(a=>a.destination===destination&&a.quantity>0).slice(-1)[0];
     if(linked) fields[destination+'TargetId'].value=linked.targetId;
     if(destination==='clinic'&&linked?.bottleMilliMl){fields.bottleMl.value=linked.bottleMilliMl/1000;fields.volumeConfirmed.checked=true;}
    }
    if(line.description.startsWith('PENDIENTE:'))tr.querySelector('.pg-row-status').textContent='Solo falta completar el nombre tapado.';
    fields.bottleMl.addEventListener('input',()=>{fields.volumeConfirmed.checked=false;});
    tr.addEventListener('input',()=>{if(saving)return;row.dirty=true;row.key=null;tr.classList.add('pg-dirty');tr.querySelector('.pg-row-status').textContent='Sin guardar';});
    return row;
   });
   const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
   function filter(){
    const value=id=>panel.querySelector('#pg-'+id).value;
    const q=normalize(value('search')),supplier=value('supplier'),invoice=value('invoice'),destination=value('destination'),state=value('state');
    let count=0,pending=0;
    for(const r of rows){
     const sale=Number(r.fields.saleQuantity.value)||0,clinic=Number(r.fields.clinicQuantity.value)||0;
     const remaining=r.line.quantity-r.line.assignedQuantity;
     const matches=normalize([r.fields.name.value,r.line.description,r.line.invoice.supplier,r.line.invoice.number,r.line.sku].join(' ')).includes(q)
      &&(!supplier||r.line.invoice.supplier===supplier)&&(!invoice||r.line.invoice.id===invoice)
      &&(!destination||(destination==='sale'&&sale>0)||(destination==='clinic'&&clinic>0)||(destination==='both'&&sale>0&&clinic>0)||(destination==='none'&&!sale&&!clinic))
      &&(!state||(state==='pending'&&remaining>0)||(state==='complete'&&remaining===0)||(state==='unpriced'&&!Number(r.fields.price.value))||(state==='dirty'&&r.dirty));
     r.tr.hidden=!matches;
     if(matches){count++;pending+=remaining;}
    }
    panel.querySelector('#pg-count').textContent=`${count} de ${rows.length} conceptos · ${pending} piezas pendientes`;
    panel.querySelector('#pg-empty').hidden=count!==0;
   }
   panel.querySelector('#pg-search').oninput=filter;
   for(const id of ['supplier','invoice','destination','state'])panel.querySelector('#pg-'+id).onchange=filter;
   panel.querySelector('#pg-clear').onclick=()=>{for(const id of ['search','supplier','invoice','destination','state'])panel.querySelector('#pg-'+id).value='';filter();};
   filter();
   panel.querySelector('#pg-save').onclick=async()=>{
    if(saving)return;const dirty=rows.filter(r=>r.dirty);const status=panel.querySelector('#pg-status');
    if(!dirty.length){status.textContent='Escribe las cantidades y precios que quieras guardar.';return;}
    const valid=[],issues=[];
    const identify=r=>r.fields.name.value.trim()||r.line.description||r.line.sku;
    const flag=(r,message)=>{r.error=message;r.tr.querySelector('.pg-row-status').textContent=identify(r)+': '+message;issues.push({row:r,message});};
    // Each row is atomic; incomplete rows must not block independent valid rows.
    for(const r of dirty){
     r.error=null;
     const f=r.fields,qty=Number(f.saleQuantity.value)+Number(f.clinicQuantity.value);
     const invalid=Object.values(f).find(el=>!el.checkValidity());
     const error=qty>r.line.quantity?'Las piezas superan las compradas.':Number(f.saleQuantity.value)>0&&!f.price.value?'Falta el precio al público.':Number(f.clinicQuantity.value)>0&&!f.bottleMl.value?'Falta el contenido en ml por envase.':Number(f.clinicQuantity.value)>0&&!f.volumeConfirmed.checked?'Falta confirmar el contenido en ml.':qty>0&&!f.name.value.trim()&&!f.saleTargetId.value&&!f.clinicTargetId.value?'Falta el nombre del producto.':invalid?`Revisa ${invalid.getAttribute('aria-label')||'el campo indicado'}: ${invalid.validationMessage}`:null;
     if(error&&!r.snapshot){flag(r,error);continue;}
     valid.push(r);
    }
    saving=true;const controls=[...panel.querySelectorAll('input,select,button')];const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);let ok=0,failed=0;
    try{
     for(const r of valid){
      const f=r.fields;r.key??=crypto.randomUUID();const body=r.snapshot||{requestKey:r.key,allocationVersion:(r.line.allocations||[]).map(a=>a.id).sort().join(','),...Object.fromEntries(Object.entries(f).map(([k,el])=>[k,el.type==='checkbox'?el.checked:el.value]))};
      try{
       const result=await get('/api/purchase-invoices/lines/'+encodeURIComponent(r.line.id)+'/redistribute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
       r.line={...r.line,...result.line};r.tr.querySelector('.pg-remaining').textContent=(r.line.quantity-r.line.assignedQuantity)+' pendientes';
       for(const a of result.allocations){const field=f[a.destination==='sale'?'saleTargetId':'clinicTargetId'];if(![...field.options].some(o=>o.value===a.targetId))field.add(new Option(a.targetName,a.targetId));field.value=a.targetId;}
       r.dirty=false;r.key=null;r.snapshot=null;r.uncertain=false;r.tr.classList.remove('pg-dirty');r.tr.querySelector('.pg-row-status').textContent='Guardado';ok++;
      }catch(e){r.uncertain=!e.status||e.status>=500;if(r.uncertain)r.snapshot=body;flag(r,e.message+(r.uncertain?' Pulsa Guardar cambios para verificar el mismo envío.':''));}
     }
     filter();
     status.replaceChildren(document.createTextNode(`${ok} fila(s) guardadas${issues.length?` · ${issues.length} pendiente(s) por corregir. Tus datos siguen en la tabla.`:'.'}`));
     if(issues.length){
      const list=document.createElement('ul');
      for(const {row,message} of issues){
       const item=document.createElement('li'),button=document.createElement('button');
       button.type='button';button.className='btn';button.textContent=identify(row)+': '+message;
       button.onclick=()=>{panel.querySelector('#pg-clear').click();row.tr.scrollIntoView({block:'center'});row.fields.name.focus({preventScroll:true});};
       item.appendChild(button);list.appendChild(item);
      }
      status.appendChild(list);
     }
    }finally{controls.forEach((c,i)=>c.disabled=disabled[i]);for(const r of rows){const n=r.line.quantity-r.line.assignedQuantity;for(const field of ['saleQuantity','clinicQuantity']){r.fields[field].max=r.line.quantity;r.fields[field].disabled=false;}if(r.uncertain)Object.values(r.fields).forEach(f=>f.disabled=true);else Object.entries(r.fields).filter(([k])=>!['saleQuantity','clinicQuantity'].includes(k)).forEach(([,f])=>f.disabled=false);}saving=false;}
   };
  }catch(e){panel.textContent=e.message;}
 }
 window.purchaseGrid={load};
})();

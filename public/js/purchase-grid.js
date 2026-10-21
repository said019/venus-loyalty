(() => {
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>(Number(v)/100).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
 async function get(url,options){const r=await fetch(url,{credentials:'include',...options});const j=await r.json();if(!r.ok||!j.success){const e=Error(j.error||'No se pudo cargar.');e.status=r.status;throw e;}return j.data;}
 async function load(){
  const panel=document.getElementById('panel-invoices');panel.innerHTML='<p>Cargando productos de tus compras…</p>';
  try{
   const [invoices,sale,clinic]=await Promise.all(['/api/purchase-invoices','/api/products','/api/clinic-inventory'].map(u=>get(u)));
   const lines=invoices.flatMap(i=>i.lines.map(l=>({...l,invoice:i}))).sort((a,b)=>Number(a.description.startsWith('PENDIENTE:'))-Number(b.description.startsWith('PENDIENTE:'))||a.invoice.supplier.localeCompare(b.invoice.supplier,'es')||a.description.localeCompare(b.description,'es'));let saving=false;
   panel.innerHTML=`<div class="ci-toolbar"><div><h3>Productos comprados</h3><p class="ci-muted">Nombres, cantidades y costos cargados de tus comprobantes. Tú eliges el destino y el precio de venta.</p></div><button class="btn primary" id="pg-save">Guardar cambios</button></div><div class="pg-controls"><input id="pg-search" placeholder="Buscar producto o proveedor…" aria-label="Buscar producto o proveedor"><label><input id="pg-pending" type="checkbox"> Solo pendientes</label><span id="pg-count">${lines.length} conceptos · ${lines.reduce((s,l)=>s+l.quantity-l.assignedQuantity,0)} piezas pendientes</span></div><p id="pg-status" role="status" aria-live="polite"></p><div class="pg-scroll"><table class="pg-table"><thead><tr><th>Producto / comprobante</th><th>Compradas<br><small>por asignar</small></th><th>Costo / pieza</th><th>Para venta<br><small>piezas</small></th><th>Precio público<br><small>por pieza</small></th><th>Consultorio<br><small>envases</small></th><th>Contenido<br><small>ml / envase</small></th></tr></thead><tbody></tbody></table></div>`;
   const tbody=panel.querySelector('tbody');
   const options=(items,line)=>'<option value="">Crear con el nombre de esta fila</option>'+items.map(p=>`<option value="${esc(p.id)}" ${p.name.trim().toLowerCase()===line.description.trim().toLowerCase()?'selected':''}>${esc(p.name)}</option>`).join('');
   const rows=lines.map(line=>{
    const tr=document.createElement('tr');const pending=line.quantity-line.assignedQuantity;
    tr.innerHTML=`<td><input data-field="name" aria-label="Nombre del producto" value="${line.description.startsWith('PENDIENTE:')?'':esc(line.description)}" placeholder="Facial Vitamina… · nombre tapado en foto" maxlength="150"><small class="pg-source">${esc(line.invoice.supplier)} · <a target="_blank" rel="noopener" href="/api/purchase-invoices/${encodeURIComponent(line.invoice.id)}/pdf">${esc(line.invoice.number)}</a></small><details><summary>Notas y vinculación</summary><div class="pg-details-body"><p>${esc(line.purchaseNote)}</p><p>${esc(line.volumeNote)}</p><label>Sumar venta a<select data-field="saleTargetId">${options(sale,line)}</select></label><label>Sumar consultorio a<select data-field="clinicTargetId">${options(clinic,line)}</select></label><small>El precio escrito se aplicará al producto de venta seleccionado al asignar piezas.</small></div></details><span class="pg-row-status" role="status"></span></td><td><strong class="pg-bought">${line.quantity}</strong><small class="pg-remaining">${pending} pendientes</small></td><td>${money(line.netTotalCents/line.quantity)}</td><td><input data-field="saleQuantity" aria-label="Piezas para venta" type="number" min="0" max="${pending}" step="1" value="0" ${pending?'':'disabled'}></td><td><input data-field="price" aria-label="Precio al público" type="number" min="0.01" max="1000000" step="0.01" value="${line.retailUnitCents?line.retailUnitCents/100:''}" placeholder="Lo defines tú"></td><td><input data-field="clinicQuantity" aria-label="Envases para consultorio" type="number" min="0" max="${pending}" step="1" value="0" ${pending?'':'disabled'}></td><td><input data-field="bottleMl" aria-label="Mililitros por envase" type="number" min="0.001" max="1000000" step="0.001" value="${line.suggestedMilliMl?line.suggestedMilliMl/1000:''}" placeholder="ml"><label class="pg-confirm"><input data-field="volumeConfirmed" type="checkbox" ${line.suggestedMilliMl?'checked':''}> ${line.suggestedMilliMl?'Según comprobante':'Confirmo ml'}</label></td>`;
    tbody.appendChild(tr);const fields=Object.fromEntries([...tr.querySelectorAll('[data-field]')].map(el=>[el.dataset.field,el]));
    const row={tr,line,fields,dirty:false,key:null};
    if(line.description.startsWith('PENDIENTE:'))tr.querySelector('.pg-row-status').textContent='Solo falta completar el nombre tapado.';
    fields.bottleMl.addEventListener('input',()=>{fields.volumeConfirmed.checked=false;});
    tr.addEventListener('input',()=>{if(saving)return;row.dirty=true;row.key=null;tr.classList.add('pg-dirty');tr.querySelector('.pg-row-status').textContent='Sin guardar';});
    return row;
   });
   function filter(){const q=panel.querySelector('#pg-search').value.toLocaleLowerCase(),pending=panel.querySelector('#pg-pending').checked;for(const r of rows)r.tr.hidden=!(r.fields.name.value+' '+r.line.description+' '+r.line.invoice.supplier).toLocaleLowerCase().includes(q)||(pending&&r.line.quantity===r.line.assignedQuantity);}
   panel.querySelector('#pg-search').oninput=filter;panel.querySelector('#pg-pending').onchange=filter;
   panel.querySelector('#pg-save').onclick=async()=>{
    if(saving)return;const dirty=rows.filter(r=>r.dirty);const status=panel.querySelector('#pg-status');
    if(!dirty.length){status.textContent='Escribe las cantidades y precios que quieras guardar.';return;}
    // Validate all edited rows before sending any stock changes.
    for(const r of dirty){
     const f=r.fields,qty=Number(f.saleQuantity.value)+Number(f.clinicQuantity.value);
     const error=qty>r.line.quantity-r.line.assignedQuantity?'Las piezas superan las pendientes.':Number(f.saleQuantity.value)>0&&!f.price.value?'Falta el precio al público.':Number(f.clinicQuantity.value)>0&&(!f.bottleMl.value||!f.volumeConfirmed.checked)?'Indica el contenido y confirma que está en ml.':qty>0&&!f.name.value.trim()&&!f.saleTargetId.value&&!f.clinicTargetId.value?'Completa el nombre del producto.':null;
     if(error||Object.values(f).some(el=>!el.checkValidity())){r.tr.hidden=false;r.tr.querySelector('.pg-row-status').textContent=error||'Revisa las cantidades y precios.';r.tr.scrollIntoView({block:'center'});status.textContent='Revisa la fila señalada antes de guardar.';return;}
    }
    saving=true;const controls=[...panel.querySelectorAll('input,select,button')];const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);let ok=0,failed=0;
    try{
     for(const r of dirty){
      const f=r.fields;r.key??=crypto.randomUUID();const body=r.snapshot||{requestKey:r.key,...Object.fromEntries(Object.entries(f).map(([k,el])=>[k,el.type==='checkbox'?el.checked:el.value]))};
      try{
       const result=await get('/api/purchase-invoices/lines/'+encodeURIComponent(r.line.id)+'/assign-row',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
       r.line={...r.line,...result.line};r.tr.querySelector('.pg-remaining').textContent=(r.line.quantity-r.line.assignedQuantity)+' pendientes';
       for(const a of result.allocations){const field=f[a.destination==='sale'?'saleTargetId':'clinicTargetId'];if(![...field.options].some(o=>o.value===a.targetId))field.add(new Option(a.targetName,a.targetId));field.value=a.targetId;}
       f.saleQuantity.value='0';f.clinicQuantity.value='0';r.dirty=false;r.key=null;r.snapshot=null;r.uncertain=false;r.tr.classList.remove('pg-dirty');r.tr.querySelector('.pg-row-status').textContent='Guardado';ok++;
      }catch(e){r.uncertain=!e.status||e.status>=500;if(r.uncertain)r.snapshot=body;r.tr.querySelector('.pg-row-status').textContent=e.message+(r.uncertain?' Pulsa Guardar cambios para verificar el mismo envío.':'');failed++;}
     }
     panel.querySelector('#pg-count').textContent=`${rows.length} conceptos · ${rows.reduce((s,r)=>s+r.line.quantity-r.line.assignedQuantity,0)} piezas pendientes`;
     status.textContent=`${ok} fila(s) guardadas${failed?` · ${failed} pendiente(s) por corregir. Tus datos siguen en la tabla.`:'.'}`;
    }finally{controls.forEach((c,i)=>c.disabled=disabled[i]);for(const r of rows){const n=r.line.quantity-r.line.assignedQuantity;for(const field of ['saleQuantity','clinicQuantity']){r.fields[field].max=n;r.fields[field].disabled=!n;}if(r.uncertain)Object.values(r.fields).forEach(f=>f.disabled=true);else Object.entries(r.fields).filter(([k])=>!['saleQuantity','clinicQuantity'].includes(k)).forEach(([,f])=>f.disabled=false);}saving=false;}
   };
  }catch(e){panel.textContent=e.message;}
 }
 window.purchaseGrid={load};
})();

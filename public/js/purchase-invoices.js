(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>(Number(c)/100).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
  let invoices=[];
  async function api(path='',options={}){
    const r=await fetch('/api/purchase-invoices'+path,{credentials:'include',...options,headers:{'Content-Type':'application/json'}});
    const j=await r.json();if(!r.ok||!j.success)throw Error(j.error||'No se pudo cargar la factura.');return j.data;
  }
  async function load(){
    const panel=document.getElementById('panel-invoices');if(!panel)return;
    panel.innerHTML='<p class="ci-muted">Cargando facturas…</p>';
    try{
      invoices=await api();
      panel.innerHTML=`<div class="ci-toolbar"><div><h3>Facturas · pendientes de clasificar</h3><p class="ci-muted">Administración decide el destino de cada pieza. El stock se suma solo al confirmar la asignación.</p></div></div>${invoices.length?invoices.map(invoice=>{
        const pending=invoice.lines.reduce((n,l)=>n+l.quantity-l.assignedQuantity,0);
        return `<section class="ci-section invoice-card"><div class="ci-toolbar"><div><h3>Factura ${esc(invoice.number)} · ${money(invoice.totalCents)}</h3><p class="ci-muted">${esc(invoice.supplier)} · ${esc(invoice.issuedOn)}<br>${invoice.lines.length} conceptos · ${invoice.lines.reduce((n,l)=>n+l.quantity,0)} piezas · <strong>${pending?pending+' por clasificar':'Todo clasificado'}</strong></p></div><a class="btn" href="/api/purchase-invoices/${encodeURIComponent(invoice.id)}/pdf" target="_blank" rel="noopener">Ver factura original</a></div><p class="ci-muted">Subtotal ${money(invoice.subtotalCents)} − descuento ${money(invoice.discountCents)} + IVA ${money(invoice.taxCents)}. Los costos no son precios de venta.</p><div class="ci-list">${invoice.lines.map(line=>`<div class="ci-row"><div><strong>${esc(line.description)}</strong><p>${line.quantity} piezas · Costo total con descuento e IVA: ${money(line.netTotalCents)}</p><small>Clave: ${esc(line.sku)}</small>${line.volumeNote?`<p class="ci-low">${esc(line.volumeNote)}</p>`:''}<p>${line.quantity-line.assignedQuantity} piezas pendientes</p>${line.allocations.map(a=>`<small>${a.quantity} pieza(s) → ${a.destination==='sale'?'Venta':'Consultorio'} · ${esc(a.targetName)}${a.bottleMilliMl?' · '+(a.bottleMilliMl/1000)+' ml por envase':''} · ${esc(a.createdBy)}</small>`).join('')}</div>${line.quantity>line.assignedQuantity?`<button class="btn primary" data-allocate="${esc(line.id)}">Decidir destino</button>`:'<span class="ci-muted">Asignado</span>'}</div>`).join('')}</div></section>`;
      }).join(''):'<p class="ci-empty">No hay facturas cargadas.</p>'}`;
      panel.querySelectorAll('[data-allocate]').forEach(b=>b.onclick=()=>openAllocation(b.dataset.allocate));
    }catch(e){panel.innerHTML=`<p class="ci-error" role="alert">${esc(e.message)}</p><button class="btn">Reintentar</button>`;panel.querySelector('button').onclick=load;}
  }
  async function openAllocation(id){
    const line=invoices.flatMap(i=>i.lines).find(l=>l.id===id);if(!line)return;
    const el=document.createElement('dialog');el.className='ci-dialog';
    el.innerHTML=`<form class="ci-form"><header><h2>Decidir destino</h2><button type="button" class="ci-close" aria-label="Cerrar">×</button></header><p><strong>${esc(line.description)}</strong></p><p class="ci-muted">Quedan ${line.quantity-line.assignedQuantity} piezas. Puedes asignar una parte a venta y otra al consultorio.</p><label>Piezas a asignar<input name="quantity" type="number" step="1" min="1" max="${line.quantity-line.assignedQuantity}" value="1" required></label><label>Destino<select name="destination" required><option value="">Elige el destino</option><option value="sale">Venta · unidades</option><option value="clinic">Consultorio · mililitros</option></select></label><label>Registrar en<select name="target" required disabled><option value="">Elige primero el destino</option></select></label><div id="pi-new" hidden><label>Nombre del producto<input name="name" maxlength="150" value="${esc(line.description)}"></label><label id="pi-price">Precio de venta por pieza ($)<input name="price" type="number" step="0.01" min="0.01" max="1000000" placeholder="Definido por administración"></label></div><div id="pi-volume" hidden><p class="ci-help">${esc(line.volumeNote||'Verifica el contenido del envase antes de confirmar.')} No se convierten gramos a ml.</p><label>Contenido real de cada envase (ml)<input name="bottleMl" type="number" step="0.001" min="0.001" max="1000000" value="${line.suggestedMilliMl?line.suggestedMilliMl/1000:''}" placeholder="Revisar en el envase"></label><label class="ci-checkbox"><input type="checkbox" name="volumeConfirmed"> Confirmé que esta cantidad está expresada en ml</label></div><p id="pi-preview" class="ci-help">La factura sigue pendiente hasta que confirmes.</p><p class="ci-error" role="alert"></p><footer><button type="button" class="btn pi-cancel">Dejar pendiente</button><button type="submit" class="btn primary">Confirmar asignación</button></footer></form>`;
    document.body.appendChild(el);el.showModal();
    const form=el.querySelector('form'),fields=form.elements,button=form.querySelector('[type=submit]');
    let saving=false;
    const close=()=>{if(!saving)el.close();};
    el.querySelector('.ci-close').onclick=close;el.querySelector('.pi-cancel').onclick=close;
    el.addEventListener('cancel',e=>{if(saving)e.preventDefault()});el.addEventListener('close',()=>el.remove(),{once:true});
    const requestKey=crypto.randomUUID();let sale=[],clinic=[]; fields.destination.disabled=true;
    function update(){
      const dest=fields.destination.value,isNew=fields.target.value==='new',isClinic=dest==='clinic';
      el.querySelector('#pi-new').hidden=!isNew;fields.name.disabled=!isNew;fields.name.required=isNew;
      el.querySelector('#pi-price').hidden=dest!=='sale';fields.price.disabled=!isNew||isClinic;fields.price.required=isNew&&dest==='sale';
      el.querySelector('#pi-volume').hidden=!isClinic;fields.bottleMl.disabled=!isClinic;fields.bottleMl.required=isClinic;fields.volumeConfirmed.disabled=!isClinic;fields.volumeConfirmed.required=isClinic;
      const qty=Number(fields.quantity.value)||0,volume=Number(fields.bottleMl.value)||0;
      el.querySelector('#pi-preview').textContent=dest==='sale'?`Se sumarán ${qty} unidades al producto de venta elegido.`:isClinic?`Se sumarán ${qty} × ${volume} ml = ${(qty*volume).toLocaleString('es-MX',{maximumFractionDigits:3})} ml al consultorio.`:'La factura sigue pendiente hasta que confirmes.';
    }
    fields.destination.onchange=()=>{
      fields.target.disabled=!fields.destination.value;
      const list=fields.destination.value==='sale'?sale:clinic;
      fields.target.innerHTML='<option value="">Elige un producto o crea uno nuevo</option><option value="new">+ Crear producto nuevo</option>'+list.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.presentation?' · '+esc(p.presentation):''}</option>`).join('');
      update();
    };
    fields.target.onchange=update;fields.quantity.oninput=update;fields.bottleMl.oninput=update;update();
    form.onsubmit=async e=>{
      e.preventDefault();if(button.disabled)return;saving=true;button.disabled=true;el.querySelector('.ci-error').textContent='';
      try{
        await api('/lines/'+encodeURIComponent(id)+'/allocate',{method:'POST',body:JSON.stringify({requestKey,quantity:fields.quantity.value,destination:fields.destination.value,targetId:fields.target.value==='new'?undefined:fields.target.value,name:fields.name.value,price:fields.price.value,bottleMl:fields.bottleMl.value,volumeConfirmed:fields.volumeConfirmed.checked})});
        button.disabled=false;saving=false;close();load();
      }catch(error){el.querySelector('.ci-error').textContent=error.message;}finally{button.disabled=false;saving=false;}
    };
    try{
      const results=await Promise.all(['/api/products','/api/clinic-inventory'].map(async url=>{const r=await fetch(url,{credentials:'include'});const j=await r.json();if(!r.ok||!j.success)throw Error('No se pudieron cargar los productos existentes. Cierra e intenta de nuevo.');return j.data;}));
      [sale,clinic]=results; fields.destination.disabled=false;
    }catch(error){el.querySelector('.ci-error').textContent=error.message;fields.destination.disabled=true;button.disabled=true;/* Permitir cerrar aunque no se pueda asignar. */el.querySelector('.pi-cancel').onclick=()=>el.close();el.querySelector('.ci-close').onclick=()=>el.close();}
  }
  window.purchaseInvoices={load};
})();

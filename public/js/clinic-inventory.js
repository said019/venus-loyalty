(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const ml = value => (Number(value || 0) / 1000).toLocaleString('es-MX', { maximumFractionDigits: 3 });
  const key = () => crypto.randomUUID();
  const admin = () => window.MI_ROL === 'admin';
  const date = value => new Date(value).toLocaleString('es-MX', { timeZone:'America/Mexico_City', dateStyle:'short', timeStyle:'short' });
  let supplies = [], offset = 0, usageOffset = 0;
  async function api(path = '', options = {}) {
    const response = await fetch('/api/clinic-inventory' + path, { credentials:'include', ...options, headers:{ 'Content-Type':'application/json', ...options.headers } });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || 'No se pudo cargar el inventario.');
    return json.data;
  }
  function dialog(title, content) {
    const el = document.createElement('dialog'); el.className = 'ci-dialog';
    el.innerHTML = `<form class="ci-form"><header><h2>${esc(title)}</h2><button type="button" class="ci-close" aria-label="Cerrar">×</button></header>${content}<p class="ci-error" role="alert"></p></form>`;
    document.body.appendChild(el);
    let done; const closed = new Promise(resolve => done = resolve);
    const close = () => { if (el.querySelector('[type=submit]')?.disabled) return; el.close(); };
    el.querySelector('.ci-close').onclick = close;
    el.addEventListener('cancel', e => { if (el.querySelector('[type=submit]')?.disabled) e.preventDefault(); });
    el.addEventListener('close', () => { el.remove(); done(); }, { once:true });
    el.showModal();
    return { el, closed, close, form:el.querySelector('form'), error:message => el.querySelector('.ci-error').textContent = message };
  }
  function bindSave(d, action) {
    d.form.onsubmit = async event => {
      event.preventDefault(); const button = d.form.querySelector('[type=submit]');
      if (button.disabled) return;
      button.disabled = true; d.error('');
      try { await action(new FormData(d.form)); button.disabled = false; d.close(); load(); }
      catch (error) { d.error(error.message); }
      finally { button.disabled = false; }
    };
  }
  const actions = (label = 'Guardar') => `<footer><button type="button" class="btn ci-cancel">Cancelar</button><button type="submit" class="btn primary">${label}</button></footer>`;
  const number = (name, label, value = '', min = '0', required = true) => `<label>${label}<input name="${name}" type="number" step="0.001" min="${min}" max="1000000" value="${value}" ${required ? 'required' : ''}></label>`;
  async function load() {
    const panel = document.getElementById('panel-clinic'); if (!panel) return;
    panel.innerHTML = '<p class="ci-muted" role="status">Cargando inventario del consultorio…</p>';
    try {
      const [list, pending, movements, usages] = await Promise.all([api(),api('/pending'),api('/activity?offset='+offset),api('/usages?offset='+usageOffset)]);
      supplies = list;
      panel.innerHTML = `<div class="ci-toolbar"><div><h3>Consultorio · mililitros</h3><p class="ci-muted">Registra lo que queda en tus frascos y lo que usas en cada servicio. Estos ml no se cobran a la clienta.</p></div>${admin() ? '<button class="btn primary" id="ci-new">+ Agregar producto</button>' : ''}</div>
        <div class="ci-help">¿Un producto es para venta y también para tratamientos? Regístralo aquí y usa <strong>Pasar de venta a consultorio</strong>: se resta el frasco de venta y se suman sus ml.</div>
        ${list.length ? `<div class="ci-grid">${list.map(s => `<article class="ci-supply"><h4>${esc(s.name)}</h4><p class="ci-muted">Frasco de ${ml(s.bottleMilliMl)} ml</p><p class="ci-balance">${ml(s.stockMilliMl)} <span>ml disponibles</span></p><p class="${s.stockMilliMl <= s.minMilliMl ? 'ci-low' : 'ci-muted'}">${s.stockMilliMl <= s.minMilliMl ? 'Existencia baja · ' : ''}Aviso en ${ml(s.minMilliMl)} ml</p>${admin() ? `<button class="btn" data-stock="${esc(s.id)}">Entrada o ajuste</button>` : ''}</article>`).join('')}</div>` : '<div class="ci-empty">Agrega tu primer producto con su contenido en ml. Puedes registrar la cantidad restante de un frasco que ya está abierto.</div>'}
        <section class="ci-section"><h3>Consumos pendientes <span class="ci-muted">(${pending.length})</span></h3><p class="ci-muted">Servicios completados desde la activación del inventario. Si lo dejas para después al cobrar, lo encuentras aquí.</p><div class="ci-list">${pending.length ? pending.map(a => `<div class="ci-row"><div><strong>${esc(a.clientName)}</strong><p>${esc(a.serviceName)} · ${esc(a.date)}</p></div><button class="btn" data-usage="${esc(a.id)}">Registrar ml usados</button></div>`).join('') : '<p class="ci-muted">No tienes consumos pendientes.</p>'}</div></section>
        <section class="ci-section"><h3>Consumos registrados</h3><div class="ci-list">${usages.length ? usages.map(u => `<div class="ci-row"><div><strong>${esc(u.clientName)} · ${esc(u.serviceName)}</strong><p>${(u.items || []).map(i => `${esc(i.name)}: ${ml(i.milliMl)} ml`).join(' · ') || 'Sin productos utilizados'}</p><small>${esc(date(u.updatedAt))} · ${esc(u.createdBy)}${u.note ? ' · '+esc(u.note) : ''}</small></div><button class="btn" data-usage="${esc(u.appointmentId)}">${admin() ? 'Ver o corregir' : 'Ver'}</button></div>`).join('') : '<p class="ci-muted">Aún no hay consumos guardados.</p>'}</div><div class="ci-pages"><button class="btn" id="ci-usage-prev" ${usageOffset ? '' : 'disabled'}>Anteriores</button><button class="btn" id="ci-usage-next" ${usages.length === 50 ? '' : 'disabled'}>Siguientes</button></div></section>
        <section class="ci-section"><h3>Movimientos de inventario</h3><div class="ci-list">${movements.length ? movements.map(m => `<div class="ci-row"><div><strong>${esc(m.supply.name)}</strong><p>${esc(({purchase:'Entrada de factura',initial:'Existencia inicial',entry:'Entrada',transfer:'De venta a consultorio',adjustment:'Ajuste',usage:'Uso en servicio',correction:'Corrección de consumo'})[m.kind] || m.kind)} · ${esc(m.note)}</p><small>${esc(date(m.createdAt))} · ${esc(m.createdBy)}</small></div><div class="ci-movement"><strong>${m.deltaMilliMl > 0 ? '+' : ''}${ml(m.deltaMilliMl)} ml</strong><small>Quedaron ${ml(m.stockAfterMilliMl)} ml</small></div></div>`).join('') : '<p class="ci-muted">Aún no hay movimientos.</p>'}</div><div class="ci-pages"><button class="btn" id="ci-prev" ${offset ? '' : 'disabled'}>Anteriores</button><button class="btn" id="ci-next" ${movements.length === 50 ? '' : 'disabled'}>Siguientes</button></div></section>`;
      panel.querySelector('#ci-new')?.addEventListener('click', createSupply);
      panel.querySelectorAll('[data-stock]').forEach(b => b.onclick = () => stockDialog(b.dataset.stock));
      panel.querySelectorAll('[data-usage]').forEach(b => b.onclick = () => openUsage(b.dataset.usage));
      panel.querySelector('#ci-prev').onclick = () => { offset = Math.max(0,offset-50); load(); };
      panel.querySelector('#ci-next').onclick = () => { offset += 50; load(); };
      panel.querySelector('#ci-usage-prev').onclick = () => { usageOffset = Math.max(0,usageOffset-50); load(); };
      panel.querySelector('#ci-usage-next').onclick = () => { usageOffset += 50; load(); };
    } catch (error) { panel.innerHTML = `<p class="ci-error" role="alert">${esc(error.message)}</p><button class="btn" id="ci-retry">Reintentar</button>`; panel.querySelector('button').onclick = load; }
  }
  function createSupply() {
    const requestKey = key();
    const d = dialog('Agregar producto al consultorio', `<p class="ci-muted">Ejemplo: frasco de 250 ml con 180 ml restantes. El inventario de venta se administra por separado.</p><label>Nombre del producto<input name="name" maxlength="150" required placeholder="Ej. Gel limpiador"></label><div class="ci-fields">${number('bottleMl','Contenido de un frasco (ml)','','0.001')}${number('stockMl','Total disponible ahora (ml)','0')}${number('minMl','Avisarme cuando queden (ml)','0')}</div>${actions('Agregar producto')}`);
    d.el.querySelector('.ci-cancel').onclick = d.close;
    bindSave(d, data => api('', {method:'POST',body:JSON.stringify({...Object.fromEntries(data),requestKey})}));
  }
  async function stockDialog(id) {
    const supply = supplies.find(s => s.id === id); if (!supply) return;
    const requestKey = key();
    const d = dialog('Entrada o ajuste · '+supply.name, `<p class="ci-muted">Disponible: ${ml(supply.stockMilliMl)} ml. Cada frasco contiene ${ml(supply.bottleMilliMl)} ml.</p><label>Movimiento<select name="kind"><option value="entry">Entrada de producto para consultorio</option><option value="transfer">Pasar de venta a consultorio</option><option value="adjustment">Ajuste por conteo, derrame o merma</option></select></label><div id="ci-ml">${number('ml','Cantidad (ml)','','0.001')}</div><label id="ci-direction" hidden>Acción<select name="direction"><option value="subtract">Restar ml</option><option value="add">Sumar ml</option></select></label><div id="ci-transfer" hidden><label>Producto del inventario de venta<select name="sourceProductId"><option value="">Cargando productos…</option></select></label><label>Frascos completos a pasar<input type="number" name="bottles" min="1" max="10000" step="1" value="1"></label><p class="ci-help" id="ci-transfer-preview"></p><p class="ci-muted">Selecciona el mismo producto y presentación. No se registra una venta ni un ingreso.</p></div><label>Motivo o referencia<input name="note" maxlength="500" required placeholder="Ej. Compra de dos frascos / abrir frasco para cabina"></label>${actions('Guardar movimiento')}`);
    const kind = d.form.elements.kind;
    const update = () => {
      const transfer = kind.value === 'transfer';
      d.el.querySelector('#ci-ml').hidden = transfer; d.form.elements.ml.disabled = transfer;
      d.el.querySelector('#ci-direction').hidden = kind.value !== 'adjustment';
      d.el.querySelector('#ci-transfer').hidden = !transfer;
      d.form.elements.sourceProductId.required = transfer; d.form.elements.sourceProductId.disabled = !transfer;
      d.form.elements.bottles.required = transfer; d.form.elements.bottles.disabled = !transfer;
      const count = Number(d.form.elements.bottles.value) || 0;
      d.el.querySelector('#ci-transfer-preview').textContent = `Se restarán ${count} unidades de venta y se sumarán ${ml(count * supply.bottleMilliMl)} ml al consultorio.`;
    };
    kind.onchange = update; d.form.elements.bottles.oninput = update; update();
    d.el.querySelector('.ci-cancel').onclick = d.close;
    bindSave(d, data => api('/'+encodeURIComponent(id)+'/stock',{method:'POST',body:JSON.stringify({...Object.fromEntries(data),requestKey})}));
    try {
      const r = await fetch('/api/products',{credentials:'include'}); const j = await r.json();
      if (!r.ok || !j.success) throw new Error('No se pudieron cargar los productos de venta.');
      d.form.elements.sourceProductId.innerHTML = '<option value="">Selecciona el producto de venta</option>'+j.data.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.presentation ? ' · '+esc(p.presentation) : ''} · ${p.stock} unidades</option>`).join('');
    } catch (error) { d.error(error.message); }
  }
  async function openUsage(id) {
    const d = dialog('¿Qué productos usaste en el servicio?', '<p id="ci-usage-content" class="ci-muted">Cargando productos…</p><footer><button type="button" class="btn ci-later">Dejar para después</button></footer>');
    d.el.querySelector('.ci-later').onclick = d.close;
    try {
      const [result, list] = await Promise.all([api('/usage/'+encodeURIComponent(id)),api()]);
      if (!d.el.isConnected) return;
      const {appointment,usage} = result;
      const readonly = !!usage && !admin();
      const requestKey = key();
      d.form.innerHTML = `<header><h2>${usage ? 'Consumo del servicio' : '¿Qué productos usaste?'}</h2><button type="button" class="ci-close" aria-label="Cerrar">×</button></header><p><strong>${esc(appointment.clientName)}</strong><br>${esc(appointment.serviceName)}</p><p class="ci-muted">${usage ? 'Al corregir se ajusta solo la diferencia y se conserva la bitácora.' : 'El pago ya está registrado. Descontaremos solo los ml que indiques, sin cambiar el cobro.'}</p>${!list.length ? '<p class="ci-help">Aún no tienes productos del consultorio. Agrégalos en Catálogo → Consultorio (ml) y vuelve a registrar este consumo.</p>' : ''}<fieldset ${readonly ? 'disabled' : ''}><div id="ci-use-rows"></div><button type="button" class="btn" id="ci-add-use" ${list.length ? '' : 'disabled'}>+ Producto utilizado</button><label class="ci-checkbox"><input type="checkbox" name="noProducts" ${usage && !usage.items.length ? 'checked' : ''}> No utilicé productos del inventario</label><label>Nota (opcional)<input name="note" maxlength="500" value="${esc(usage?.note || '')}" placeholder="Ej. Dosis aproximada utilizada"></label></fieldset><p class="ci-error" role="alert"></p><footer><button type="button" class="btn ci-later">${usage ? 'Cerrar' : 'Dejar para después'}</button>${readonly ? '' : '<button type="submit" class="btn primary">'+(usage ? 'Guardar corrección' : 'Guardar consumo')+'</button>'}</footer>`;
      const rows = d.el.querySelector('#ci-use-rows');
      function addRow(item) {
        const row = document.createElement('div'); row.className = 'ci-use-row';
        row.innerHTML = `<label>Producto<select required><option value="">Selecciona un producto</option>${list.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${ml(s.stockMilliMl)} ml disponibles</option>`).join('')}</select></label><label>Ml usados<input type="number" min="0.001" max="1000000" step="0.001" required placeholder="Ej. 3.5"></label><button type="button" class="btn ci-remove" aria-label="Quitar producto">×</button><small class="ci-remaining"></small>`;
        const select = row.querySelector('select'), amount = row.querySelector('input');
        if (item) { select.value = item.supplyId; amount.value = item.milliMl/1000; }
        const remaining = () => {
          const s = list.find(s=>s.id===select.value);
          const old = usage?.items.find(i=>i.supplyId===select.value)?.milliMl || 0;
          const left = s ? s.stockMilliMl + old - Math.round((Number(amount.value)||0)*1000) : 0;
          row.querySelector('small').textContent = s ? `Quedarían ${ml(left)} ml` : '';
          row.querySelector('small').classList.toggle('ci-error',left<0);
        };
        select.onchange = remaining; amount.oninput = remaining;
        row.querySelector('.ci-remove').onclick = () => row.remove();
        rows.appendChild(row); remaining();
      }
      (usage?.items || []).forEach(addRow);
      if (!usage && list.length) addRow();
      d.el.querySelector('#ci-add-use').onclick = () => addRow();
      const toggle = () => {
        const none = d.form.elements.noProducts.checked;
        rows.querySelectorAll('input,select,button').forEach(el=>el.disabled=none || readonly);
        d.el.querySelector('#ci-add-use').disabled = none || !list.length || readonly;
      };
      d.form.elements.noProducts.onchange = toggle; toggle();
      d.el.querySelector('.ci-close').onclick = d.close;
      d.el.querySelector('.ci-later').onclick = d.close;
      if (!readonly) bindSave(d, () => {
        const noProducts = d.form.elements.noProducts.checked;
        const items = noProducts ? [] : [...rows.children].map(row=>({supplyId:row.querySelector('select').value,ml:row.querySelector('input').value}));
        return api('/usage/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({requestKey,revision:usage?.revision || 0,items,noProducts,note:d.form.elements.note.value})});
      });
    } catch (error) { if (d.el.isConnected) d.error(error.message+' El pago no se modifica; puedes registrar el consumo más tarde.'); }
    return d.closed;
  }
  // Un cobro agrupado pregunta por cada servicio y no abre diálogos encima.
  let queue = Promise.resolve();
  function promptCompleted(ids) {
    queue = queue.then(async () => { for (const id of [...new Set(ids)]) await openUsage(id); }).catch(error => console.error('[Inventario]',error));
    return queue;
  }
  window.clinicInventory = { load, promptCompleted, openUsage };
})();

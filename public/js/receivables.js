(() => {
  const money = n => (n / 100).toLocaleString('es-MX', {style:'currency',currency:'MXN'});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date());
  const date = s => new Date(s).toLocaleString('es-MX',{timeZone:'America/Mexico_City'});
  const methods = {efectivo:'Efectivo',tarjeta_credito:'Tarjeta de crédito',tarjeta_debito:'Tarjeta de débito',transferencia:'Transferencia'};
  let accounts = [], selectedDay, reportRange, busy = false;
  const sequence = {caja:0,report:0};
  async function api(path, body) {
    const response = await window.apiFetch('/api/receivables' + path, body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
    const data = await response.json();
    if (!response.ok || !data.success) throw Object.assign(new Error(data.error || 'No se pudo completar la operación.'),{status:response.status});
    return data.data;
  }
  function metrics(data) { return `<div class="ar-metrics"><div>Saldo pendiente actual<strong>${money(data.balanceCents)}</strong></div><div>Abonos recibidos en el período<strong>${money(data.receivedCents)}</strong></div><div>Cuentas abiertas<strong>${data.openCount}</strong></div></div>`; }
  const caja = document.getElementById('receivables-caja');
  const report = document.getElementById('receivables-report');
  if (!caja || !report) return;
  caja.innerHTML = `<header><h3>Pagos pendientes</h3><button type="button" data-new>Nuevo pendiente</button></header><div data-metrics></div><div class="ar-filters"><input type="search" aria-label="Buscar cuenta por cobrar" placeholder="Buscar clienta, teléfono o concepto"><select aria-label="Estado de cuenta"><option value="open">Pendientes</option><option value="all">Todas</option><option value="paid">Liquidadas</option><option value="cancelled">Canceladas</option></select><button type="button" data-refresh aria-label="Actualizar pagos pendientes" title="Actualizar"><i class="fas fa-sync-alt" aria-hidden="true"></i></button></div><p data-error role="status"></p><div data-list></div>`;
  report.innerHTML = '<h3>Cuentas por cobrar</h3><p data-period></p><p data-error role="status"></p><div data-metrics></div><div data-list></div>';
  const dialog = document.createElement('dialog');
  dialog.id = 'receivable-dialog'; document.body.append(dialog);
  function render() {
    const query = caja.querySelector('input').value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const state = caja.querySelector('select').value;
    const rows = accounts.filter(a => (state === 'all' || (state === 'open' ? a.balanceCents > 0 : a.status === state)) && `${a.clientName} ${a.clientPhone} ${a.concept}`.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query));
    caja.querySelector('[data-list]').innerHTML = rows.map(a => `<article class="ar-account"><div class="ar-row"><div><strong>${esc(a.clientName)}</strong><p>${esc(a.concept)}</p><small>${esc(date(a.createdAt))} · ${esc(a.clientPhone)}</small></div><div><strong>${money(a.balanceCents)}</strong><small>${({pending:'Pendiente',partial:'Pago parcial',paid:'Liquidada',cancelled:'Cancelada'})[a.status]}</small></div></div><p>${a.correction ? `Cobro corregido: ${money(a.correction.originalCents)} · Recibido en la cita: ${money(a.correction.receivedCents)} · ${esc(date(a.correction.at))}<br>` : ""}Total ${money(a.totalCents)} · Recibido ${money(a.paidCents)}</p><div class="ar-actions">${a.balanceCents > 0 ? `<button type="button" data-pay="${esc(a.id)}">Registrar abono</button>` : ''}${!a.paidCents && !a.cancelledAt ? `<button type="button" data-cancel="${esc(a.id)}">Cancelar cuenta</button>` : ''}</div><details><summary>Historial de abonos (${a.payments.length})</summary>${a.payments.map(p => `<div class="ar-row"><div>${money(p.amountCents)} · ${esc(methods[p.method])}<small>${esc(date(p.at))} · ${esc(p.by)}</small></div>${p.reversedAt ? '<span>Registro deshecho</span>' : `<button type="button" data-reverse="${esc(a.id)}" data-payment="${esc(p.id)}">Deshacer registro</button>`}</div>`).join('') || '<p>Sin abonos.</p>'}</details></article>`).join('') || '<p>No hay cuentas con estos filtros.</p>';
  }
  async function loadCaja(day = today()) {
    selectedDay = day; const token = ++sequence.caja;
    try {
      const data = await api(`?from=${encodeURIComponent(day)}&to=${encodeURIComponent(day)}`);
      if (token !== sequence.caja) return;
      accounts = data.accounts; caja.querySelector('[data-metrics]').innerHTML = metrics(data); caja.querySelector('[data-error]').textContent = ''; render();
    } catch(e) { if(token === sequence.caja) caja.querySelector('[data-error]').textContent = e.message; }
  }
  async function loadReport(from,to) {
    reportRange = [from,to]; const token = ++sequence.report;
    try {
      const data = await api(`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if(token !== sequence.report) return;
      report.querySelector('[data-period]').textContent = `Abonos: ${from} a ${to}. Saldo pendiente actual.`;
      report.querySelector('[data-metrics]').innerHTML = metrics(data);
      report.querySelector('[data-list]').innerHTML = data.accounts.filter(a => a.balanceCents > 0).map(a => `<div class="ar-row"><div>${esc(a.clientName)}<small>${esc(a.concept)}</small></div><strong>${money(a.balanceCents)}</strong></div>`).join('') || '<p>Sin saldos pendientes.</p>';
      report.querySelector('[data-error]').textContent = '';
    } catch(e) { if(token === sequence.report) report.querySelector('[data-error]').textContent = e.message; }
  }
  async function refresh() {
    await loadCaja(selectedDay);
    window.cargarCaja?.();
    if(reportRange) {
      if(window.cargarReportePorRango) await window.cargarReportePorRango(...reportRange);
      else await loadReport(...reportRange);
    }
  }
  function open(account) {
    if(busy) return;
    const requestKey = crypto.randomUUID(); let snapshot;
    dialog.innerHTML = `<form><header><h3>${account ? 'Registrar abono' : 'Nuevo pendiente'}</h3><button type="button" data-close aria-label="Cerrar">×</button></header>${account ? `<p>${esc(account.clientName)} · ${esc(account.concept)}</p><p>Saldo: <strong>${money(account.balanceCents)}</strong></p><label>Abono recibido hoy<input name="amount" type="number" min="0.01" step="1" data-money-whole max="${account.balanceCents/100}" value="${account.balanceCents/100}" required></label>` : '<label>Clienta<input name="clientName" maxlength="150" required></label><label>Teléfono<input name="clientPhone" type="tel" maxlength="30"></label><label>Concepto<input name="concept" maxlength="250" required></label><label>Total por cobrar<input name="total" type="number" min="0.01" step="1" data-money-whole required></label><label>Abono recibido hoy<input name="initial" type="number" min="0" step="1" data-money-whole value="0" required></label>'}<label>Método del abono<select name="method">${Object.entries(methods).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><p data-error role="alert"></p><button type="submit">${account ? 'Registrar abono' : 'Guardar pendiente'}</button></form>`;
    dialog.querySelector('[data-close]').onclick = () => {if(!busy) dialog.close();};
    dialog.querySelector('form').onsubmit = async e => {
      e.preventDefault(); if(busy) return;
      snapshot ||= {...Object.fromEntries(new FormData(e.target)),requestKey,...(account ? {action:'pay',revision:account.revision} : {})};
      busy = true; dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
      try { await api(account ? '/'+account.id : '',snapshot); dialog.close(); await refresh(); }
      catch(error) {
        dialog.querySelector('[data-error]').textContent = error.message;
        if(error.status >= 400 && error.status < 500) { snapshot = null; dialog.querySelectorAll('input,select').forEach(el=>el.disabled=false); }
        else dialog.querySelector('[data-error]').textContent += ' Reintenta sin cambiar los datos para comprobar si se guardó.';
      } finally {busy=false;dialog.querySelectorAll('button').forEach(el=>el.disabled=false);}
    };
    dialog.showModal();
  }
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  caja.querySelector('input').oninput=render; caja.querySelector('select').onchange=render;
  caja.addEventListener('click',async e=>{
    const button=e.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-new'))return open();
    if(button.hasAttribute('data-refresh'))return loadCaja(selectedDay);
    if(button.dataset.pay)return open(accounts.find(a=>a.id===button.dataset.pay));
    const id=button.dataset.reverse||button.dataset.cancel;if(!id)return;
    const account=accounts.find(a=>a.id===id), reverse=Boolean(button.dataset.reverse);
    if(!window.confirm(reverse?'¿Deshacer este registro? Se retirará de ingresos y volverá al saldo pendiente. Esto no devuelve dinero a la tarjeta.':'¿Cancelar esta cuenta sin abonos? Se conservará en el historial.'))return;
    busy=true;button.disabled=true;
    try {await api('/'+id,{action:reverse?'reverse':'cancel',paymentId:button.dataset.payment,revision:account.revision,requestKey:crypto.randomUUID()});await refresh();}
    catch(error){caja.querySelector('[data-error]').textContent=error.message;}
    finally{busy=false;button.disabled=false;}
  });
  function correctAppointment(appointment) {
    const total=Math.round(Number(appointment.totalPaid)*100);
    const requestKey=crypto.randomUUID();
    dialog.innerHTML=`<form class="ar-correction"><header><h3>Dejar saldo pendiente</h3><button type="button" data-close aria-label="Cerrar">×</button></header><p>${esc(appointment.clientName)} · ${esc(appointment.serviceName)}</p><p>Cobro registrado: <strong>${money(total)}</strong></p><label>Cuánto recibiste realmente en este cobro<input name="received" type="number" min="0" max="${(total-1)/100}" step="1" data-money-whole required placeholder="0"></label><p>Quedará pendiente: <strong data-balance>—</strong></p><p>Se corregirá el ingreso registrado y la diferencia aparecerá en Pagos pendientes. Los productos y apartados aplicados se conservan.</p><p data-error role="alert"></p><button type="submit">Corregir cobro y guardar pendiente</button></form>`;
    const form=dialog.querySelector('form'),input=form.elements.received,button=form.querySelector('[type=submit]');
    let submitting=false;
    input.oninput=()=>{const n=Number(input.value);form.querySelector('[data-balance]').textContent=input.value!==''&&Number.isFinite(n)&&n>=0&&n*100<total?money(total-Math.round(n*100)):'—';};
    form.querySelector('[data-close]').onclick=()=>{if(!submitting)dialog.close();};
    form.onsubmit=async e=>{
      e.preventDefault();if(submitting||!form.reportValidity())return;
      submitting=true;button.disabled=true;form.querySelector('[data-error]').textContent='';
      try{
        await api('/appointment/'+encodeURIComponent(appointment.id),{received:input.value,version:appointment.updatedAt,requestKey});
        dialog.close();document.getElementById('modal-cobrar-cita')?.remove();
        window.showNotification?.('Cobro corregido. La diferencia quedó en Pagos pendientes.','success');
        refresh();
      }catch(error){form.querySelector('[data-error]').textContent=error.message;}
      finally{submitting=false;button.disabled=false;}
    };
    dialog.showModal();input.focus();
  }
  window.receivables={loadCaja,loadReport,correctAppointment};
})();

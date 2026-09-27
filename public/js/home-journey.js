(() => {
  const root = document.getElementById('tab-overview');
  if (!root) return;
  root.classList.add('journey');
  const localDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const heading = root.querySelector('#dash-greeting');
  heading.id = 'journey-heading'; heading.textContent = 'Jornada';
  root.querySelector('.admin-eyebrow').textContent = 'Venus';
  const panel = document.createElement('section'); panel.className = 'journey-agenda';
  panel.innerHTML = '<header><h3>Agenda del día</h3><div class="journey-date-tools"><button type="button" class="btn ghost" aria-label="Día anterior" title="Día anterior">‹</button><button type="button" class="btn ghost">Hoy</button><input type="date" aria-label="Fecha de la agenda"><button type="button" class="btn ghost" aria-label="Día siguiente" title="Día siguiente">›</button></div></header><div class="journey-rows" aria-live="polite"></div>';
  root.querySelector('.today-grid').after(panel);
  const input = panel.querySelector('input'); input.value = localDay();
  const rows = panel.querySelector('.journey-rows');
  let sequence = 0;
  const message = text => { rows.replaceChildren(); const p = document.createElement('p'); p.className = 'journey-empty'; p.textContent = text; rows.append(p); };
  window.loadHomeJourney = async () => {
    const version = ++sequence;
    message('Cargando agenda…');
    try {
      const response = await apiFetch('/api/appointments?date=' + encodeURIComponent(input.value));
      const json = await response.json();
      if (version !== sequence) return;
      if (!response.ok || !json.success || !Array.isArray(json.data)) throw new Error('appointments');
      const appointments = json.data.filter(a => a.status !== 'cancelled').sort((a,b) => String(a.time).localeCompare(String(b.time)));
      if (!appointments.length) { message('Sin citas para esta fecha. Consulta otro día o agenda una nueva cita.'); return; }
      rows.replaceChildren();
      const now = new Intl.DateTimeFormat('en-GB', {timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit'}).format(new Date());
      const next = input.value >= localDay() ? appointments.find(a => ['scheduled','confirmed'].includes(a.status) && (input.value > localDay() || a.time >= now)) : null;
      for (const a of appointments) {
        const row = document.createElement('article'); row.className = 'journey-row' + (a === next ? ' is-next' : '');
        const time = document.createElement('time'); time.textContent = a.time;
        const info = document.createElement('div'); info.className = 'journey-client';
        const name = document.createElement('strong'); name.textContent = a.clientName;
        const service = document.createElement('span'); service.textContent = a.serviceName; info.append(name, service);
        const status = document.createElement('span'); status.className = 'journey-status';
        status.textContent = a === next ? 'Próxima cita' : ({confirmed:'Confirmada',scheduled:'Sin confirmar',completed:a.totalPaid == null ? 'Por cobrar' : 'Atendida',rescheduling:'Por reagendar'}[a.status] || a.status);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn ghost'; button.textContent = 'Ver cita';
        button.addEventListener('click', () => editAppointment(a.id));
        row.append(time, info, status, button); rows.append(row);
      }
    } catch {
      if (version !== sequence) return;
      message('No se pudo cargar la agenda.');
      const retry = document.createElement('button'); retry.className = 'btn ghost'; retry.textContent = 'Reintentar'; retry.addEventListener('click',window.loadHomeJourney); rows.append(retry);
    }
  };
  const shift = delta => { const date = new Date(input.value + 'T12:00:00'); date.setDate(date.getDate() + delta); input.value = [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); window.loadHomeJourney(); };
  const buttons = panel.querySelectorAll('header button');
  buttons[0].onclick = () => shift(-1); buttons[1].onclick = () => { input.value = localDay(); window.loadHomeJourney(); }; buttons[2].onclick = () => shift(1);
  input.addEventListener('change', () => { if (input.value) window.loadHomeJourney(); });
  const observer = new MutationObserver(() => { if (!root.classList.contains('hidden')) window.loadHomeJourney(); });
  observer.observe(root,{attributes:true,attributeFilter:['class']});
  if (!root.classList.contains('hidden')) window.loadHomeJourney();
})();

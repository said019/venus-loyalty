(() => {
  const root = document.getElementById('appointment-search');
  if (!root) return;
  const input = root.querySelector('input');
  const status = document.getElementById('appointment-search-status');
  const list = document.getElementById('appointment-search-results');
  const more = document.getElementById('appointment-search-more');
  let scope = 'all', controller, timer, offset = 0, version = 0;
  const labels = { scheduled: 'Agendada', confirmed: 'Confirmada', rescheduling: 'Por reagendar', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistió', in_progress: 'En curso' };
  function render(appointment) {
    const row = document.createElement('li');
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = appointment.clientName;
    const detail = document.createElement('p');
    const date = new Date(`${appointment.date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    detail.textContent = `${date}, ${appointment.time} · ${appointment.serviceName}`;
    const state = document.createElement('small');
    state.textContent = `${labels[appointment.status] || appointment.status} · ${appointment.clientPhone || 'Sin teléfono'}`;
    info.append(name, detail, state);
    const action = document.createElement('button');
    action.type = 'button';
    const canReschedule = ['scheduled', 'confirmed', 'rescheduling'].includes(appointment.status);
    action.textContent = canReschedule ? 'Reagendar' : 'Agendar otra';
    action.setAttribute('aria-label', `${action.textContent}: ${appointment.clientName}, ${date}`);
    action.onclick = async () => {
      action.disabled = true;
      try {
        if (canReschedule) await window.openReschedule(appointment.id);
        else await window.bookAgainFromSearch(appointment);
      } catch { status.textContent = 'No se pudo abrir la cita. Intenta de nuevo.'; }
      finally { action.disabled = false; }
    };
    row.append(info, action);
    list.append(row);
  }
  async function search(append = false) {
    clearTimeout(timer);
    controller?.abort();
    controller = new AbortController();
    const current = ++version;
    const q = input.value.trim();
    more.hidden = true;
    if (!append) { offset = 0; list.replaceChildren(); }
    if (q.length < 2) { status.textContent = q ? 'Escribe al menos 2 caracteres.' : ''; return; }
    status.textContent = 'Buscando citas…';
    root.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`/api/appointments/search?${new URLSearchParams({ q, scope, offset })}`, { signal: controller.signal });
      const json = await response.json();
      if (current !== version) return;
      if (!response.ok || !json.success) throw new Error();
      json.data.forEach(render);
      offset += json.data.length;
      status.textContent = json.total ? `${offset} de ${json.total} citas` : 'No encontramos citas con esa búsqueda.';
      more.textContent = 'Ver más citas';
      more.hidden = !json.hasMore;
    } catch (error) {
      if (current !== version || error.name === 'AbortError') return;
      status.textContent = 'No se pudo buscar. Intenta de nuevo.';
      more.textContent = 'Reintentar búsqueda';
      more.hidden = false;
    } finally { if (current === version) root.removeAttribute('aria-busy'); }
  }
  input.addEventListener('input', () => {
    controller?.abort(); ++version;
    root.removeAttribute('aria-busy');
    clearTimeout(timer);
    list.replaceChildren(); more.hidden = true;
    timer = setTimeout(() => search(), 300);
  });
  root.querySelectorAll('[data-scope]').forEach(button => button.onclick = () => {
    scope = button.dataset.scope;
    root.querySelectorAll('[data-scope]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    search();
  });
  more.onclick = () => search(true);
  document.addEventListener('appointment-rescheduled', () => { if (input.value.trim().length >= 2) search(); });
})();

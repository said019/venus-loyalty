(() => {
  const dialog = document.createElement('dialog');
  dialog.id = 'reschedule-dialog';
  dialog.setAttribute('aria-labelledby', 'reschedule-title');
  dialog.innerHTML = `
    <header><h2 id="reschedule-title">Reagendar cita</h2><button type="button" class="reschedule-close" aria-label="Cerrar"><i class="fas fa-times" aria-hidden="true"></i> Cerrar</button></header>
    <div class="reschedule-summary"><strong id="reschedule-client"></strong><span id="reschedule-service"></span><br><span id="reschedule-current"></span></div>
    <form>
      <fieldset style="border:0;padding:0;margin:0;min-width:0">
        <div class="reschedule-fields">
          <label>Nueva fecha<input name="date" type="date" required></label>
          <label>Nueva hora<input name="time" type="time" required></label>
        </div>
        <label class="reschedule-notify"><input name="notify" type="checkbox" checked> Avisar por WhatsApp</label>
      </fieldset>
      <button type="submit" class="reschedule-submit">Guardar y avisar</button>
    </form>
    <p role="status" aria-live="polite"></p>
    <button type="button" class="reschedule-submit" id="reschedule-retry" hidden>Reintentar aviso</button>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const fields = form.elements;
  const submit = form.querySelector('[type=submit]');
  const status = dialog.querySelector('[role=status]');
  const retry = dialog.querySelector('#reschedule-retry');
  let appointment;
  let busy = false;
  let request = 0;
  const label = () => { submit.textContent = fields.notify.checked ? 'Guardar y avisar' : 'Guardar cambio'; };
  fields.notify.addEventListener('change', label);
  dialog.querySelector('.reschedule-close').onclick = () => { if (!busy) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  const setBusy = value => {
    busy = value;
    form.querySelector('fieldset').disabled = value;
    submit.disabled = value;
    retry.disabled = value;
    dialog.querySelector('.reschedule-close').disabled = value;
  };
  window.openReschedule = async id => {
    if (busy) return;
    const token = ++request;
    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(id)}`);
      const json = await response.json();
      if (token !== request) return;
      if (!response.ok || !json.success) throw new Error(json.error || 'No se pudo abrir la cita.');
      appointment = json.data;
      if (['completed', 'cancelled', 'no_show'].includes(appointment.status)) {
        throw new Error('Solo puedes reagendar citas pendientes o confirmadas.');
      }
      document.getElementById('editApptDialog')?.close();
      form.reset();
      form.hidden = false;
      retry.hidden = true;
      status.textContent = '';
      fields.date.value = appointment.date;
      fields.time.value = appointment.time;
      fields.notify.checked = Boolean(appointment.clientPhone);
      label();
      dialog.querySelector('#reschedule-client').textContent = appointment.clientName;
      dialog.querySelector('#reschedule-service').textContent = `${appointment.serviceName} · ${appointment.durationMinutes || 60} min`;
      const date = new Date(`${appointment.date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
      dialog.querySelector('#reschedule-current').textContent = `Actual: ${date}, ${appointment.time}`;
      if (!appointment.clientPhone) status.textContent = 'Sin teléfono registrado. El cambio se guardará sin aviso.';
      if (!dialog.open) dialog.showModal();
      fields.date.focus();
    } catch (error) { await venusAlert(error.message); }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (fields.date.value === appointment.date && fields.time.value === appointment.time) {
      status.textContent = 'Elige una fecha u hora diferente.';
      return;
    }
    const body = { date: fields.date.value, time: fields.time.value, notifyClient: fields.notify.checked };
    setBusy(true);
    submit.textContent = 'Guardando...';
    status.textContent = '';
    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointment.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'No se pudo guardar el cambio.');
      appointment = { ...appointment, date: body.date, time: body.time };
      document.dispatchEvent(new Event('appointment-rescheduled'));
      form.hidden = true;
      const failed = json.notification?.status === 'failed';
      status.textContent = failed
        ? 'Cita reagendada. No se pudo enviar el WhatsApp. Puedes reintentar el aviso.'
        : json.notification?.status === 'sent' ? 'Cita reagendada y aviso enviado por WhatsApp.' : 'Cita reagendada sin enviar aviso.';
      retry.hidden = !failed;
      clearAppointmentsCache();
      Promise.allSettled([loadMonthAppointments(true), loadAppointments(true), loadMonthStats(true)]);
    } catch (error) {
      status.textContent = error.message === 'Failed to fetch'
        ? 'Se perdió la conexión. Revisa la agenda antes de volver a guardar.' : error.message;
    } finally { setBusy(false); label(); }
  });
  retry.onclick = async () => {
    if (busy) return;
    setBusy(true);
    status.textContent = 'Enviando aviso...';
    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointment.id)}/reschedule-notification`, { method: 'POST' });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || 'No se pudo enviar. Intenta de nuevo en un momento.');
      status.textContent = 'Aviso enviado por WhatsApp.';
      retry.hidden = true;
    } catch (error) { status.textContent = `La cita sigue guardada. ${error.message}`; }
    finally { setBusy(false); }
  };
})();

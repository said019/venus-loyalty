// marketing.js — Portal de marketing de Venus
const API_BASE = '';
let token = null;

// ── Auth ──
async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (json.ok) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    loadInitialData();
  } else {
    document.getElementById('login-error').textContent = 'Credenciales inválidas';
  }
}

async function checkSession() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/me`, { credentials: 'include' });
    const json = await res.json();
    if (json.uid && json.role === 'marketing') {
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      loadInitialData();
    }
  } catch { /* no logueado */ }
}

function logout() {
  fetch(`${API_BASE}/api/admin/logout`, { method: 'POST', credentials: 'include' })
    .finally(() => location.reload());
}

// ── API helper ──
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return res.json();
}

// ── Router ──
function navigate(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.querySelectorAll('.sidebar-nav li a').forEach(a => a.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
  if (view === 'mis-citas') loadMisCitas();
  if (view === 'agenda') loadAgenda();
  if (view === 'leads') loadLeads();
  if (view === 'giftcards') loadGiftCards();
  if (view === 'reportes') loadReportes();
}

// ── Initial data ──
async function loadInitialData() {
  // Cargar servicios
  try {
    const res = await apiFetch('/api/public/services');
    if (res.success && res.data) {
      const agtService = document.getElementById('agt-service');
      const gcService = document.getElementById('gc-service');
      res.data.forEach(s => {
        const opt1 = new Option(`${s.name} ($${s.price})`, s.id);
        const opt2 = new Option(`${s.name} ($${s.price})`, s.id);
        agtService.appendChild(opt1);
        gcService.appendChild(opt2);
      });
    }
  } catch { /* servicios opcionales */ }

  // Cargar staff
  try {
    const res = await apiFetch('/api/admin/staff');
    if (res.success && res.data) {
      const agtStaff = document.getElementById('agt-staff');
      res.data.forEach(s => {
        const opt = new Option(s.name || s.email, s.id);
        agtStaff.appendChild(opt);
      });
    }
  } catch { /* staff opcional */ }

  // Fecha por defecto = hoy
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('agenda-date').value = today;
  document.getElementById('agt-date').value = today;
}

// ── Agendar ──
async function agendarCita(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Agendando...';

  const serviceSelect = document.getElementById('agt-service');
  const serviceName = serviceSelect.value
    ? serviceSelect.options[serviceSelect.selectedIndex].text.split(' (')[0]
    : document.getElementById('agt-service-name').value;

  const data = {
    name: document.getElementById('agt-name').value,
    phone: document.getElementById('agt-phone').value,
    serviceId: serviceSelect.value || null,
    serviceName: serviceName,
    date: document.getElementById('agt-date').value,
    time: document.getElementById('agt-time').value,
    durationMinutes: 60,
    assignedAdminId: document.getElementById('agt-staff').value || null,
    source: document.getElementById('agt-source').value || 'marketing',
    sendWhatsAppConfirmation: document.getElementById('agt-whatsapp').checked,
  };

  const res = await apiFetch('/api/marketing/appointments', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  const result = document.getElementById('agendar-result');
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-calendar-plus"></i> Agendar y generar comisión';

  if (res.success) {
    result.className = 'result-msg success';
    result.textContent = '✅ Cita agendada. Comisión generada.';
    e.target.reset();
    document.getElementById('agt-date').value = new Date().toISOString().split('T')[0];
  } else {
    result.className = 'result-msg error';
    result.textContent = '❌ ' + (res.error || 'Error al agendar');
  }
}

// ── Mis Citas ──
async function loadMisCitas() {
  const res = await apiFetch('/api/marketing/commissions');
  if (res.success) {
    document.getElementById('comm-pending').textContent = `$${res.totals.pendiente.toFixed(0)}`;
    document.getElementById('comm-paid').textContent = `$${res.totals.pagada.toFixed(0)}`;
    document.getElementById('comm-total').textContent = res.totals.total;
  }

  const apptsRes = await apiFetch('/api/marketing/appointments');
  if (apptsRes.success && apptsRes.data) {
    const tbody = document.getElementById('mis-citas-tbody');
    tbody.innerHTML = apptsRes.data.map(a => `
      <tr>
        <td>${esc(a.clientName)}</td>
        <td>${esc(a.serviceName)}</td>
        <td>${esc(a.date)}</td>
        <td>${esc(a.time)}</td>
        <td><span class="badge badge-${a.status}">${a.status}</span></td>
        <td>$${(res.data.find(c => c.appointmentId === a.id)?.amount || 0).toFixed(0)}</td>
      </tr>
    `).join('');
  }
}

// ── Agenda ──
async function loadAgenda() {
  const date = document.getElementById('agenda-date').value;
  if (!date) return;
  const res = await apiFetch(`/api/marketing/agenda?date=${date}`);
  if (res.success && res.data) {
    const list = document.getElementById('agenda-list');
    list.innerHTML = res.data.map(a => `
      <div class="agenda-item">
        <span class="agenda-time">${esc(a.time)}</span>
        <div class="agenda-info">
          <div class="ag-name">${esc(a.clientName)}</div>
          <div class="ag-service">${esc(a.serviceName)} · ${a.status}</div>
        </div>
      </div>
    `).join('') || '<p style="color:var(--text-muted)">No hay citas este día</p>';
  }
}

// ── Leads ──
async function loadLeads() {
  const res = await apiFetch('/api/marketing/leads');
  if (res.success && res.data) {
    const cols = document.querySelectorAll('.kanban-col');
    cols.forEach(c => c.querySelector('.kanban-body').innerHTML = '');
    res.data.forEach(lead => {
      const col = document.querySelector(`.kanban-col[data-status="${lead.status}"]`);
      if (!col) return;
      const scoreClass = lead.score >= 60 ? 'score-high' : lead.score >= 30 ? 'score-mid' : 'score-low';
      col.querySelector('.kanban-body').innerHTML += `
        <div class="lead-card" onclick="convertLead('${lead.id}')">
          <div class="lead-name">${esc(lead.name)}</div>
          <div class="lead-phone">${esc(lead.phone)}</div>
          <span class="lead-score ${scoreClass}">Score: ${lead.score}</span>
        </div>
      `;
    });
  }
}

async function saveLead() {
  const data = {
    name: document.getElementById('lead-name').value,
    phone: document.getElementById('lead-phone').value,
    email: document.getElementById('lead-email').value,
    origin: document.getElementById('lead-origin').value,
    notes: document.getElementById('lead-notes').value,
  };
  const res = await apiFetch('/api/marketing/leads', { method: 'POST', body: JSON.stringify(data) });
  if (res.success) {
    document.getElementById('lead-form').classList.add('hidden');
    loadLeads();
  }
}

async function convertLead(id) {
  if (!confirm('¿Convertir este lead en cita? Se abrirá el formulario de agendar.')) return;
  // Por simplicidad, convertir con servicio y fecha por defecto
  const today = new Date().toISOString().split('T')[0];
  const res = await apiFetch(`/api/marketing/leads/${id}/convert`, {
    method: 'POST',
    body: JSON.stringify({ serviceName: 'Consulta', date: today, time: '10:00' }),
  });
  if (res.success) {
    alert('✅ Lead convertido en cita. Comisión generada.');
    loadLeads();
  } else {
    alert('❌ ' + (res.error || 'Error'));
  }
}

// ── Campañas WhatsApp ──
async function sendCampaign() {
  const data = {
    segment: document.getElementById('camp-segment').value,
    message: document.getElementById('camp-message').value,
    limit: parseInt(document.getElementById('camp-limit').value) || null,
  };
  const res = await apiFetch('/api/marketing/whatsapp-campaign', { method: 'POST', body: JSON.stringify(data) });
  const result = document.getElementById('camp-result');
  if (res.success) {
    result.className = 'result-msg success';
    result.textContent = `✅ Campaña iniciada. ${res.totalRecipients} destinatarios.`;
  } else {
    result.className = 'result-msg error';
    result.textContent = '❌ ' + (res.error || 'Error');
  }
}

// ── Push Wallet ──
async function sendPush() {
  const data = {
    title: document.getElementById('push-title').value,
    message: document.getElementById('push-message').value,
    type: document.getElementById('push-type').value,
  };
  const res = await apiFetch('/api/marketing/wallet-push', { method: 'POST', body: JSON.stringify(data) });
  const result = document.getElementById('push-result');
  if (res.success) {
    result.className = 'result-msg success';
    result.textContent = `✅ Push enviado. ${res.googleSent || 0} Google, ${res.appleSent || 0} Apple.`;
  } else {
    result.className = 'result-msg error';
    result.textContent = '❌ ' + (res.error || 'Error');
  }
}

// ── Gift Cards ──
async function loadGiftCards() {
  const res = await apiFetch('/api/marketing/giftcards');
  if (res.success && res.data) {
    const tbody = document.getElementById('gc-tbody');
    tbody.innerHTML = res.data.map(gc => `
      <tr>
        <td>${esc(gc.code)}</td>
        <td>${esc(gc.serviceName || '-')}</td>
        <td>${esc(gc.recipientName || '-')}</td>
        <td><span class="badge badge-${gc.status}">${gc.status}</span></td>
        <td>${gc.expiresAt ? new Date(gc.expiresAt).toLocaleDateString() : '-'}</td>
        <td><button class="btn-ghost" onclick="sendGCWhatsApp('${gc.id}')"><i class="fab fa-whatsapp"></i></button></td>
      </tr>
    `).join('');
  }
}

async function saveGiftCard() {
  const data = {
    serviceId: document.getElementById('gc-service').value,
    recipientName: document.getElementById('gc-recipient').value,
    recipientPhone: document.getElementById('gc-phone').value,
    message: document.getElementById('gc-message').value,
    validityDays: parseInt(document.getElementById('gc-validity').value),
  };
  const res = await apiFetch('/api/marketing/giftcards', { method: 'POST', body: JSON.stringify(data) });
  if (res.success) {
    document.getElementById('gc-form').classList.add('hidden');
    loadGiftCards();
  } else {
    alert('❌ ' + (res.error || 'Error'));
  }
}

function sendGCWhatsApp(id) {
  alert('Función de envío por WhatsApp disponible desde el panel admin.');
}

// ── Reportes ──
async function loadReportes() {
  // Embudo
  const funnelRes = await apiFetch('/api/marketing/reports/funnel');
  if (funnelRes.success && funnelRes.data) {
    const d = funnelRes.data;
    document.getElementById('rep-leads').textContent = d.totalLeads;
    document.getElementById('rep-citas').textContent = d.totalCitas;
    document.getElementById('rep-completadas').textContent = d.completadas;
    const conv = d.totalLeads > 0 ? ((d.convertidos / d.totalLeads) * 100).toFixed(0) : 0;
    document.getElementById('rep-conv').textContent = `${conv}%`;

    const funnel = document.getElementById('rep-funnel');
    funnel.innerHTML = `
      <div class="funnel-step"><span class="funnel-label">Leads</span><span class="funnel-count">${d.totalLeads}</span></div>
      <div class="funnel-step"><span class="funnel-label">Agendados</span><span class="funnel-count">${d.agendados}</span></div>
      <div class="funnel-step"><span class="funnel-label">Convertidos</span><span class="funnel-count">${d.convertidos}</span></div>
      <div class="funnel-step"><span class="funnel-label">Citas completadas</span><span class="funnel-count">${d.completadas}</span></div>
    `;
  }

  // Sources
  const sourcesRes = await apiFetch('/api/marketing/reports/sources');
  if (sourcesRes.success && sourcesRes.data) {
    const list = document.getElementById('rep-sources');
    list.innerHTML = Object.entries(sourcesRes.data).map(([src, info]) => `
      <div class="source-bar"><span>${esc(src)}</span><span>${info.total} citas (${info.completed} completadas)</span></div>
    `).join('');
  }

  // Monthly
  const monthlyRes = await apiFetch('/api/marketing/reports/monthly');
  if (monthlyRes.success && monthlyRes.data) {
    const list = document.getElementById('rep-monthly');
    list.innerHTML = Object.entries(monthlyRes.data).map(([month, info]) => `
      <div class="monthly-item"><span>${month}</span><span>${info.total} agendadas, ${info.completed} completadas</span></div>
    `).join('');
  }
}

// ── Utils ──
function esc(s) { return String(s || '').replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c])); }

// ── Event listeners ──
document.addEventListener('DOMContentLoaded', () => {
  checkSession();

  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    login(document.getElementById('login-email').value, document.getElementById('login-password').value);
  });

  document.getElementById('logout-btn').addEventListener('click', logout);

  document.querySelectorAll('.sidebar-nav li a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      navigate(a.dataset.view);
    });
  });

  document.getElementById('agendar-form').addEventListener('submit', agendarCita);
  document.getElementById('agenda-load').addEventListener('click', loadAgenda);
  document.getElementById('lead-add-btn').addEventListener('click', () => document.getElementById('lead-form').classList.toggle('hidden'));
  document.getElementById('lead-save').addEventListener('click', saveLead);
  document.getElementById('camp-send').addEventListener('click', sendCampaign);
  document.getElementById('push-send').addEventListener('click', sendPush);
  document.getElementById('gc-add-btn').addEventListener('click', () => document.getElementById('gc-form').classList.toggle('hidden'));
  document.getElementById('gc-save').addEventListener('click', saveGiftCard);

  // Si el servicio es "otro", mostrar campo de texto
  document.getElementById('agt-service').addEventListener('change', e => {
    document.getElementById('agt-service-name').style.display = e.target.value ? 'none' : 'block';
  });
});
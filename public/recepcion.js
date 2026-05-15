// public/recepcion.js
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function guardSession() {
  const r = await fetch("/api/admin/me");
  if (!r.ok) { window.location.replace("/admin-login.html"); return null; }
  const me = await r.json();
  if (me.role !== "recepcion" && me.role !== "admin") {
    window.location.replace("/admin-login.html"); return null;
  }
  return me;
}

function tickClock() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  $("#recClock").textContent = `${hh}:${mm}`;
}

function activateTab(name) {
  $$(".rec-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".rec-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));
}

function wireTabs() {
  $$(".rec-tab").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
}

function wireLogout() {
  $("#recLogout").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.replace("/admin-login.html");
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function stateOf(c) {
  if (c.totalPaid != null) return "cobrada";
  if (c.status === "completed") return "llego";
  if (c.status === "confirmed" || c.confirmedAt) return "confirmada";
  return "pendiente";
}

const STATE_LABEL = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  llego: "Llegó",
  cobrada: "Cobrada",
};

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function renderCitas(citas) {
  const total = citas.length;
  const llegadas = citas.filter((c) => stateOf(c) === "llego" || stateOf(c) === "cobrada").length;
  const pendientes = citas.filter((c) => stateOf(c) === "pendiente").length;
  $("#recCounters").innerHTML =
    `Citas hoy: <b>${total}</b> · Llegaron: <b>${llegadas}</b> · Pendientes: <b>${pendientes}</b>`;

  const sorted = [...citas].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  if (!sorted.length) {
    $("#recCitasHoy").innerHTML = `<div class="alert alert-light">Sin citas hoy.</div>`;
    return;
  }
  $("#recCitasHoy").innerHTML = sorted.map((c) => {
    const st = stateOf(c);
    const isPaid = c.totalPaid != null;
    const cancelBtn = isPaid
      ? `<button class="btn btn-secondary btn-disabled" title="Cita pagada — solicita al admin">Cancelar</button>`
      : `<button class="btn btn-outline-danger" data-action="cancel" data-id="${c.id}">Cancelar</button>`;

    let actions = "";
    if (st === "pendiente" || st === "confirmada") {
      actions = `
        <button class="btn btn-success" data-action="checkin" data-id="${c.id}">✓ Check-in</button>
        <button class="btn btn-outline-primary" data-action="reschedule" data-id="${c.id}">📅 Reagendar</button>
        <button class="btn btn-outline-secondary" data-action="wa" data-phone="${escapeHtml(c.clientPhone)}">💬 WA</button>
        ${cancelBtn}`;
    } else if (st === "llego") {
      actions = `
        <button class="btn btn-primary" data-action="cobrar" data-id="${c.id}">💳 Cobrar</button>
        <button class="btn btn-outline-secondary" data-action="expediente" data-id="${c.id}">Ver expediente</button>`;
    } else if (st === "cobrada") {
      actions = `
        <button class="btn btn-outline-secondary" data-action="expediente" data-id="${c.id}">Ver expediente</button>
        <button class="btn btn-outline-secondary" data-action="wa" data-phone="${escapeHtml(c.clientPhone)}">💬 WA</button>`;
    }

    return `
      <article class="rec-card">
        <div class="hora">${escapeHtml(c.time || "--:--")}</div>
        <div>
          <div class="cliente">${escapeHtml(c.clientName)}</div>
          <div class="servicio">${escapeHtml(c.serviceName)}</div>
          <div><span class="estado ${st}">${STATE_LABEL[st]}</span></div>
        </div>
        <div class="rec-actions">${actions}</div>
      </article>`;
  }).join("");
}

async function loadCitasHoy() {
  const date = todayISO();
  try {
    const r = await fetch(`/api/appointments?date=${date}`);
    if (!r.ok) {
      $("#recCitasHoy").innerHTML = `<div class="alert alert-warning">No se pudieron cargar las citas.</div>`;
      return;
    }
    const payload = await r.json();
    const citas = Array.isArray(payload) ? payload : (payload.data || []);
    renderCitas(citas);
  } catch (e) {
    console.error("[recepcion] loadCitasHoy", e);
    $("#recCitasHoy").innerHTML = `<div class="alert alert-warning">Error de red.</div>`;
  }
}

function wireCitasActions() {
  $("#recCitasHoy").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn || btn.classList.contains("btn-disabled")) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === "checkin") {
      const r = await fetch(`/api/appointments/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (r.ok) loadCitasHoy();
      else alert("No se pudo hacer check-in.");
      return;
    }

    if (action === "cancel") {
      if (!confirm("¿Cancelar esta cita?")) return;
      const r = await fetch(`/api/appointments/${id}/cancel`, { method: "PATCH" });
      if (r.status === 403) alert("Cita pagada — solicita al admin.");
      else if (r.ok) loadCitasHoy();
      else alert("No se pudo cancelar.");
      return;
    }

    if (action === "cobrar") {
      activateTab("cobrar");
      return;
    }

    if (action === "wa") {
      const phone = btn.dataset.phone || "";
      window.open(`https://wa.me/${String(phone).replace(/\D/g, "")}`, "_blank");
      return;
    }

    if (action === "reschedule") {
      activateTab("calendario");
      return;
    }

    if (action === "expediente") {
      activateTab("clientas");
      return;
    }
  });
}

(async function init() {
  const me = await guardSession();
  if (!me) return;
  tickClock(); setInterval(tickClock, 30000);
  wireTabs();
  wireLogout();
  wireCitasActions();
  loadCitasHoy();
  setInterval(loadCitasHoy, 60000);
})();

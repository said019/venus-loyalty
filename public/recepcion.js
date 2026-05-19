// public/recepcion.js — Panel de recepción Venus (página independiente, sin admin.html embebido)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// ---------- Sesión ----------
async function guardSession() {
  const r = await fetch("/api/admin/me");
  if (!r.ok) { location.replace("/admin-login.html"); return null; }
  const me = await r.json();
  if (me.role !== "recepcion" && me.role !== "admin") {
    location.replace("/admin-login.html"); return null;
  }
  return me;
}

// ---------- Utilidades ----------
function pad(n) { return String(n).padStart(2, "0"); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function digits(s) { return String(s || "").replace(/\D/g, ""); }
function waLink(phone) {
  const d = digits(phone);
  const full = d.length === 10 ? "52" + d : d;
  return `https://wa.me/${full}`;
}

function tickClock() {
  const d = new Date();
  $("#recClock").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function activateTab(name) {
  $$(".rec-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".rec-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));
  if (name === "cobrar") {
    const f = $("#recPosFrame");
    if (f && !f.src) f.src = f.dataset.src; // lazy: solo carga el POS cuando se abre
  }
  if (name === "calendario" && !calLoaded) { calLoaded = true; loadCalendar(); }
  if (name === "clientas" && !cardsLoaded) { cardsLoaded = true; loadCards(); }
  if (name === "whatsapp") loadRequests();
}

// ---------- Estado de cita ----------
function stateOf(c) {
  if (c.totalPaid != null) return "cobrada";
  if (c.status === "completed") return "llego";
  if (c.status === "confirmed" || c.confirmedAt) return "confirmada";
  return "pendiente";
}
const STATE_LABEL = { pendiente: "Pendiente", confirmada: "Confirmada", llego: "Llegó", cobrada: "Cobrada" };

function citaCard(c) {
  const st = stateOf(c);
  const paid = c.totalPaid != null;
  const cancelBtn = paid
    ? `<button class="rec-btn rec-btn-danger is-locked" title="Cita pagada — pide al admin">Cancelar</button>`
    : `<button class="rec-btn rec-btn-danger" data-action="cancel" data-id="${c.id}">Cancelar</button>`;
  let actions = "";
  if (st === "pendiente" || st === "confirmada") {
    actions = `
      <button class="rec-btn rec-btn-ok" data-action="checkin" data-id="${c.id}">Check-in</button>
      <button class="rec-btn rec-btn-ghost" data-action="wa" data-phone="${esc(c.clientPhone)}">WhatsApp</button>
      ${cancelBtn}`;
  } else if (st === "llego") {
    actions = `
      <button class="rec-btn rec-btn-primary" data-action="cobrar">Cobrar</button>
      <button class="rec-btn rec-btn-ghost" data-action="wa" data-phone="${esc(c.clientPhone)}">WhatsApp</button>`;
  } else {
    actions = `<button class="rec-btn rec-btn-ghost" data-action="wa" data-phone="${esc(c.clientPhone)}">WhatsApp</button>`;
  }
  return `
    <article class="rec-card">
      <div class="hora">${esc(c.time || "--:--")}</div>
      <div>
        <div class="cliente">${esc(c.clientName)}</div>
        <div class="servicio">${esc(c.serviceName)}</div>
        <span class="estado ${st}">${STATE_LABEL[st]}</span>
      </div>
      <div class="rec-actions">${actions}</div>
    </article>`;
}

function countersText(citas) {
  const total = citas.length;
  const llegaron = citas.filter((c) => ["llego", "cobrada"].includes(stateOf(c))).length;
  const pend = citas.filter((c) => stateOf(c) === "pendiente").length;
  return `Citas: <b>${total}</b> &nbsp;·&nbsp; Llegaron: <b>${llegaron}</b> &nbsp;·&nbsp; Pendientes: <b>${pend}</b>`;
}

async function fetchCitas(dateISO) {
  const r = await fetch(`/api/appointments?date=${dateISO}`);
  if (!r.ok) throw new Error("fetch citas " + r.status);
  const p = await r.json();
  return Array.isArray(p) ? p : (p.data || []);
}

// ---------- HOY ----------
async function loadCitasHoy() {
  try {
    const citas = await fetchCitas(todayISO());
    $("#recCounters").innerHTML = countersText(citas);
    const sorted = [...citas].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    $("#recCitasHoy").innerHTML = sorted.length
      ? sorted.map(citaCard).join("")
      : `<div class="rec-empty">Sin citas para hoy.</div>`;
  } catch (e) {
    console.error("[recepcion] loadCitasHoy", e);
    $("#recCitasHoy").innerHTML = `<div class="rec-empty">No se pudieron cargar las citas.</div>`;
  }
}

// ---------- CALENDARIO ----------
let calLoaded = false;
let calDate = todayISO();

async function loadCalendar() {
  $("#recDatePick").value = calDate;
  try {
    const citas = await fetchCitas(calDate);
    $("#recCalCounters").innerHTML = countersText(citas);
    const sorted = [...citas].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    $("#recCitasCal").innerHTML = sorted.length
      ? sorted.map(citaCard).join("")
      : `<div class="rec-empty">Sin citas para esta fecha.</div>`;
  } catch (e) {
    console.error("[recepcion] loadCalendar", e);
    $("#recCitasCal").innerHTML = `<div class="rec-empty">No se pudieron cargar las citas.</div>`;
  }
}
function shiftCalDate(days) {
  const d = new Date(calDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  calDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  loadCalendar();
}

// ---------- Acciones de cita (delegadas) ----------
async function handleCitaAction(ev) {
  const btn = ev.target.closest("[data-action]");
  if (!btn || btn.classList.contains("is-locked")) return;
  const { action, id, phone } = btn.dataset;

  if (action === "wa") { window.open(waLink(phone), "_blank"); return; }
  if (action === "cobrar") { activateTab("cobrar"); return; }

  if (action === "checkin") {
    const r = await fetch(`/api/appointments/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    if (r.ok) { refreshCitasViews(); } else { alert("No se pudo hacer check-in."); }
    return;
  }
  if (action === "cancel") {
    if (!confirm("¿Cancelar esta cita?")) return;
    const r = await fetch(`/api/appointments/${id}/cancel`, { method: "PATCH" });
    if (r.status === 403) alert("Esta cita ya está pagada. Solicita al administrador para cancelarla.");
    else if (r.ok) refreshCitasViews();
    else alert("No se pudo cancelar.");
    return;
  }
}
function refreshCitasViews() {
  loadCitasHoy();
  if (calLoaded) loadCalendar();
}

// ---------- CLIENTAS ----------
let cardsLoaded = false;
let cardsPage = 1;
let cardsQuery = "";
let cardsTotalPages = 1;

async function loadCards() {
  const params = new URLSearchParams({ page: String(cardsPage), q: cardsQuery });
  try {
    const r = await fetch(`/api/admin/cards?${params}`);
    if (!r.ok) throw new Error("cards " + r.status);
    const data = await r.json();
    const items = data.items || data.data || [];
    cardsTotalPages = data.totalPages || data.pages || 1;
    $("#recCardsPage").textContent = `Página ${cardsPage} de ${cardsTotalPages}`;
    $("#recCardsPrev").disabled = cardsPage <= 1;
    $("#recCardsNext").disabled = cardsPage >= cardsTotalPages;
    if (!items.length) {
      $("#recCardsList").innerHTML = `<div class="rec-empty">No se encontraron clientas.</div>`;
      return;
    }
    $("#recCardsList").innerHTML = items.map((c) => {
      const stamps = c.stamps ?? c.points ?? 0;
      return `
        <div class="rec-client">
          <div class="name">${esc(c.name || "Sin nombre")}</div>
          <div class="phone">${esc(c.phone || "—")}</div>
          <div class="meta">
            <span class="rec-pill">${stamps} sello${stamps === 1 ? "" : "s"}</span>
            ${c.email ? `<span class="rec-pill">${esc(c.email)}</span>` : ""}
          </div>
          <div class="acts">
            <button class="rec-btn rec-btn-ghost" data-wa="${esc(c.phone)}">WhatsApp</button>
          </div>
        </div>`;
    }).join("");
  } catch (e) {
    console.error("[recepcion] loadCards", e);
    $("#recCardsList").innerHTML = `<div class="rec-empty">No se pudieron cargar las clientas.</div>`;
  }
}

// ---------- SOLICITUDES (booking requests) ----------
async function loadRequests() {
  try {
    const r = await fetch("/api/booking-requests");
    if (!r.ok) throw new Error("requests " + r.status);
    const p = await r.json();
    const list = (Array.isArray(p) ? p : (p.data || p.items || []))
      .filter((x) => !x.status || x.status === "pending" || x.status === "contacted");
    if (!list.length) {
      $("#recRequests").innerHTML = `<div class="rec-empty">No hay solicitudes pendientes.</div>`;
      return;
    }
    $("#recRequests").innerHTML = list.map((req) => {
      const when = [req.preferredDate, req.preferredTime].filter(Boolean).join(" · ");
      return `
        <article class="rec-req">
          <div>
            <div class="who">${esc(req.name || req.clientName || "Sin nombre")}</div>
            <div class="det">
              ${esc(req.phone || "")}${req.serviceName ? " · " + esc(req.serviceName) : ""}
              ${when ? " · " + esc(when) : ""}
              ${req.status === "contacted" ? ' · <span class="rec-pill">Contactada</span>' : ""}
            </div>
            ${req.notes ? `<div class="det">${esc(req.notes)}</div>` : ""}
          </div>
          <div class="acts">
            <button class="rec-btn rec-btn-ghost" data-req-wa="${esc(req.phone)}">WhatsApp</button>
            <button class="rec-btn rec-btn-ghost" data-req-contact="${req.id}">Contactada</button>
            <button class="rec-btn rec-btn-ok" data-req-book="${req.id}">Agendar</button>
            <button class="rec-btn rec-btn-danger" data-req-reject="${req.id}">Rechazar</button>
          </div>
        </article>`;
    }).join("");
  } catch (e) {
    console.error("[recepcion] loadRequests", e);
    $("#recRequests").innerHTML = `<div class="rec-empty">No se pudieron cargar las solicitudes.</div>`;
  }
}

async function handleRequestAction(ev) {
  const t = ev.target.closest("button");
  if (!t) return;
  if (t.dataset.reqWa != null) { window.open(waLink(t.dataset.reqWa), "_blank"); return; }
  if (t.dataset.reqContact) {
    await fetch(`/api/booking-requests/${t.dataset.reqContact}/contacted`, { method: "POST" });
    loadRequests(); return;
  }
  if (t.dataset.reqReject) {
    if (!confirm("¿Rechazar esta solicitud?")) return;
    await fetch(`/api/booking-requests/${t.dataset.reqReject}/rejected`, { method: "POST" });
    loadRequests(); return;
  }
  if (t.dataset.reqBook) {
    await fetch(`/api/booking-requests/${t.dataset.reqBook}/booked`, { method: "POST" });
    loadRequests();
    activateTab("calendario");
    return;
  }
}

// ---------- MODAL NUEVA CITA ----------
let servicesCache = [];
let apptSelectedPhone = "";

async function loadServicesIntoSelect() {
  if (servicesCache.length) return;
  try {
    const r = await fetch("/api/services");
    const p = await r.json();
    servicesCache = (p.data || p || []).filter((s) => s.isActive !== false);
    const sel = $("#recApptService");
    sel.innerHTML = `<option value="" disabled selected>Selecciona…</option>` +
      servicesCache.map((s) => `<option value="${esc(s.name)}" data-id="${s.id}">${esc(s.name)} — $${Number(s.price || 0).toFixed(0)}</option>`).join("");
  } catch (e) { console.error("[recepcion] services", e); }
}

let cardSuggestTimer = null;
async function suggestCards(q) {
  const box = $("#recApptSuggest");
  if (!q || q.length < 2) { box.classList.remove("show"); box.innerHTML = ""; return; }
  try {
    const r = await fetch(`/api/admin/cards?page=1&q=${encodeURIComponent(q)}`);
    const data = await r.json();
    const items = (data.items || data.data || []).slice(0, 6);
    if (!items.length) { box.classList.remove("show"); box.innerHTML = ""; return; }
    box.innerHTML = items.map((c) =>
      `<button type="button" data-name="${esc(c.name)}" data-phone="${esc(c.phone)}">
         ${esc(c.name)}<span class="sub"> · ${esc(c.phone || "sin teléfono")}</span>
       </button>`).join("");
    box.classList.add("show");
  } catch { box.classList.remove("show"); }
}

function openApptModal(prefillDate) {
  const dlg = $("#recApptDialog");
  $("#recApptForm").reset();
  $("#recApptErr").hidden = true;
  apptSelectedPhone = "";
  $("#recApptDate").value = prefillDate || (activeCalDateOrToday());
  loadServicesIntoSelect();
  dlg.showModal();
}
function activeCalDateOrToday() {
  const calActive = $('[data-pane="calendario"]').classList.contains("active");
  return calActive ? calDate : todayISO();
}

async function submitAppt(ev) {
  ev.preventDefault();
  const name = $("#recApptName").value.trim();
  const phone = digits($("#recApptPhone").value);
  const serviceName = $("#recApptService").value;
  const date = $("#recApptDate").value;
  const time = $("#recApptTime").value;
  const errEl = $("#recApptErr");

  if (!name || !phone || !serviceName || !date || !time) {
    errEl.textContent = "Completa todos los campos.";
    errEl.hidden = false; return;
  }
  const svc = servicesCache.find((s) => s.name === serviceName);
  const saveBtn = $("#recApptSave");
  saveBtn.disabled = true; saveBtn.textContent = "Agendando…";
  try {
    const r = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, phone,
        serviceId: svc?.id,
        serviceName,
        date, time,
        durationMinutes: svc?.durationMinutes ? Number(svc.durationMinutes) : 60,
        price: svc?.price != null ? Number(svc.price) : undefined,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) {
      errEl.textContent = j.error || "No se pudo agendar la cita.";
      errEl.hidden = false;
      return;
    }
    $("#recApptDialog").close();
    refreshCitasViews();
    if (date === calDate && calLoaded) loadCalendar();
  } catch (e) {
    errEl.textContent = "Error de red. Intenta de nuevo.";
    errEl.hidden = false;
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = "Agendar";
  }
}

// ---------- Wiring ----------
function wire() {
  $$(".rec-tab").forEach((b) => b.addEventListener("click", () => activateTab(b.dataset.tab)));

  $("#recLogout").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    location.replace("/admin-login.html");
  });

  // Citas (Hoy + Calendario, delegado)
  $("#recCitasHoy").addEventListener("click", handleCitaAction);
  $("#recCitasCal").addEventListener("click", handleCitaAction);

  // Calendario nav
  $("#recDatePrev").addEventListener("click", () => shiftCalDate(-1));
  $("#recDateNext").addEventListener("click", () => shiftCalDate(1));
  $("#recDateToday").addEventListener("click", () => { calDate = todayISO(); loadCalendar(); });
  $("#recDatePick").addEventListener("change", (e) => { calDate = e.target.value; loadCalendar(); });

  // Clientas
  let searchTimer = null;
  $("#recCardSearch").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      cardsQuery = e.target.value.trim();
      cardsPage = 1;
      loadCards();
    }, 350);
  });
  $("#recCardsPrev").addEventListener("click", () => { if (cardsPage > 1) { cardsPage--; loadCards(); } });
  $("#recCardsNext").addEventListener("click", () => { if (cardsPage < cardsTotalPages) { cardsPage++; loadCards(); } });
  $("#recCardsList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-wa]");
    if (b) window.open(waLink(b.dataset.wa), "_blank");
  });

  // Solicitudes
  $("#recRequests").addEventListener("click", handleRequestAction);
  $("#recReqRefresh").addEventListener("click", loadRequests);

  // Nueva cita
  $$('[data-go="nueva-cita"]').forEach((b) =>
    b.addEventListener("click", () => openApptModal()));
  $("#recApptCancel").addEventListener("click", () => $("#recApptDialog").close());
  $("#recApptForm").addEventListener("submit", submitAppt);
  $("#recApptName").addEventListener("input", (e) => {
    clearTimeout(cardSuggestTimer);
    cardSuggestTimer = setTimeout(() => suggestCards(e.target.value.trim()), 300);
  });
  $("#recApptSuggest").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-name]");
    if (!b) return;
    $("#recApptName").value = b.dataset.name;
    $("#recApptPhone").value = b.dataset.phone || "";
    apptSelectedPhone = b.dataset.phone || "";
    $("#recApptSuggest").classList.remove("show");
  });
}

// ---------- Init ----------
(async function init() {
  const me = await guardSession();
  if (!me) return;
  tickClock(); setInterval(tickClock, 20000);
  wire();
  loadCitasHoy();
  setInterval(() => {
    loadCitasHoy();
    if ($('[data-pane="whatsapp"]').classList.contains("active")) loadRequests();
  }, 60000);
})();

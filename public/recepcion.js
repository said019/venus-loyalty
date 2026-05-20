// public/recepcion.js — Venus Recepción (standalone, spa boutique aesthetic)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ============== SESIÓN ============== */
async function guardSession() {
  const r = await fetch("/api/admin/me");
  if (!r.ok) { location.replace("/admin-login.html"); return null; }
  const me = await r.json();
  if (me.role !== "recepcion" && me.role !== "admin") {
    location.replace("/admin-login.html"); return null;
  }
  return me;
}

/* ============== UTILS ============== */
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
function prettyDate(iso) {
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  } catch { return iso; }
}

function tickClock() {
  const d = new Date();
  $("#recClock").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ============== THEME ============== */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const themeColor = t === "dark" ? "#23211c" : "#f3eee2";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
}
function initTheme() {
  const saved = localStorage.getItem("admin-theme") || "light";
  applyTheme(saved);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(cur === "dark" ? "light" : "dark");
  localStorage.setItem("admin-theme", document.documentElement.getAttribute("data-theme"));
}

/* ============== TABS ============== */
function activateTab(name) {
  $$(".tab").forEach((b) => {
    const active = b.dataset.tab === name;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  $$(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));
  if (name === "cobrar") {
    const f = $("#recPosFrame");
    if (f && !f.src) f.src = f.dataset.src;
  }
  if (name === "calendario" && !calLoaded) { calLoaded = true; loadCalendar(); }
  if (name === "clientas" && !cardsLoaded) { cardsLoaded = true; loadCards(); }
  if (name === "whatsapp") loadRequests();
}

/* ============== CITAS ============== */
function stateOf(c) {
  if (c.totalPaid != null) return "cobrada";
  if (c.status === "completed") return "llego";
  if (c.status === "confirmed" || c.confirmedAt) return "confirmada";
  return "pendiente";
}
const STATE_LABEL = { pendiente: "Pendiente", confirmada: "Confirmada", llego: "Llegó", cobrada: "Cobrada" };

function citaItem(c) {
  const st = stateOf(c);
  const paid = c.totalPaid != null;
  const cancelBtn = paid
    ? `<button class="btn btn-danger is-locked" title="Cita pagada, pide al admin"><i class="fa-solid fa-ban"></i><span>Cancelar</span></button>`
    : `<button class="btn btn-danger" data-action="cancel" data-id="${c.id}"><i class="fa-solid fa-xmark"></i><span>Cancelar</span></button>`;
  let actions = "";
  if (st === "pendiente" || st === "confirmada") {
    actions = `
      <button class="btn btn-ok" data-action="checkin" data-id="${c.id}"><i class="fa-solid fa-check"></i><span>Check-in</span></button>
      <button class="btn btn-ghost" data-action="wa" data-phone="${esc(c.clientPhone)}"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span></button>
      ${cancelBtn}`;
  } else if (st === "llego") {
    actions = `
      <button class="btn btn-primary" data-action="cobrar"><i class="fa-regular fa-credit-card"></i><span>Cobrar</span></button>
      <button class="btn btn-ghost" data-action="wa" data-phone="${esc(c.clientPhone)}"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span></button>`;
  } else {
    actions = `<button class="btn btn-ghost" data-action="wa" data-phone="${esc(c.clientPhone)}"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span></button>`;
  }
  return `
    <li class="cita">
      <div class="cita-time">${esc(c.time || "—")}</div>
      <div class="cita-body">
        <div class="cita-client">${esc(c.clientName)}</div>
        <div class="cita-svc">${esc(c.serviceName)}</div>
        <span class="cita-status status-${st}">${STATE_LABEL[st]}</span>
      </div>
      <div class="cita-actions">${actions}</div>
    </li>`;
}

function renderKPIs(container, citas) {
  const total = citas.length;
  const llegaron = citas.filter((c) => ["llego", "cobrada"].includes(stateOf(c))).length;
  const pend = citas.filter((c) => stateOf(c) === "pendiente").length;
  container.innerHTML = `
    <div class="kpi"><span class="kpi-lbl">Citas</span><span class="kpi-val">${total}</span></div>
    <div class="kpi"><span class="kpi-lbl">Llegaron</span><span class="kpi-val">${llegaron}</span></div>
    <div class="kpi"><span class="kpi-lbl">Pendientes</span><span class="kpi-val">${pend}</span></div>`;
}

async function fetchCitas(dateISO) {
  const r = await fetch(`/api/appointments?date=${dateISO}`);
  if (!r.ok) throw new Error("fetch citas " + r.status);
  const p = await r.json();
  return Array.isArray(p) ? p : (p.data || []);
}

const EMPTY_CITAS = `
  <li class="empty">
    <i class="fa-regular fa-calendar-check"></i>
    <strong>Sin citas para esta fecha</strong>
    Disfruta el día tranquilo.
  </li>`;
const ERR_CITAS = `
  <li class="empty">
    <i class="fa-solid fa-circle-exclamation"></i>
    <strong>No se pudieron cargar las citas</strong>
    Revisa tu conexión e intenta de nuevo.
  </li>`;

/* ============== HOY ============== */
async function loadCitasHoy() {
  $("#recHoyDate").textContent = prettyDate(todayISO());
  try {
    const citas = await fetchCitas(todayISO());
    renderKPIs($("#recCounters"), citas);
    const sorted = [...citas].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    $("#recCitasHoy").innerHTML = sorted.length ? sorted.map(citaItem).join("") : EMPTY_CITAS;
  } catch (e) {
    console.error("[recepcion] loadCitasHoy", e);
    $("#recCitasHoy").innerHTML = ERR_CITAS;
  }
}

/* ============== CALENDARIO ============== */
let calLoaded = false;
let calDate = todayISO();
async function loadCalendar() {
  $("#recDatePick").value = calDate;
  try {
    const citas = await fetchCitas(calDate);
    renderKPIs($("#recCalCounters"), citas);
    const sorted = [...citas].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    $("#recCitasCal").innerHTML = sorted.length ? sorted.map(citaItem).join("") : EMPTY_CITAS;
  } catch (e) {
    console.error("[recepcion] loadCalendar", e);
    $("#recCitasCal").innerHTML = ERR_CITAS;
  }
}
function shiftCalDate(days) {
  const d = new Date(calDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  calDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  loadCalendar();
}

/* ============== ACCIONES DE CITA ============== */
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
    if (r.ok) refreshCitasViews(); else alert("No se pudo hacer check-in.");
    return;
  }
  if (action === "cancel") {
    if (!confirm("¿Cancelar esta cita?")) return;
    const r = await fetch(`/api/appointments/${id}/cancel`, { method: "PATCH" });
    if (r.status === 403) alert("Esta cita ya está pagada. Pide al administrador para cancelarla.");
    else if (r.ok) refreshCitasViews();
    else alert("No se pudo cancelar.");
  }
}
function refreshCitasViews() {
  loadCitasHoy();
  if (calLoaded) loadCalendar();
}

/* ============== CLIENTAS ============== */
let cardsLoaded = false;
let cardsPage = 1;
let cardsQuery = "";
let cardsTotalPages = 1;

const EMPTY_CARDS = `
  <div class="empty" style="grid-column:1/-1;">
    <i class="fa-regular fa-address-card"></i>
    <strong>Sin resultados</strong>
    Ajusta la búsqueda o registra una nueva clienta desde el admin.
  </div>`;

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
    if (!items.length) { $("#recCardsList").innerHTML = EMPTY_CARDS; return; }
    $("#recCardsList").innerHTML = items.map((c) => {
      const stamps = c.stamps ?? c.points ?? 0;
      return `
        <div class="clienta">
          <div class="clienta-name">${esc(c.name || "Sin nombre")}</div>
          <div class="clienta-phone"><i class="fa-solid fa-phone"></i>${esc(c.phone || "—")}</div>
          <div class="clienta-meta">
            <span class="pill"><i class="fa-solid fa-circle"></i>${stamps} sello${stamps === 1 ? "" : "s"}</span>
            ${c.email ? `<span class="pill"><i class="fa-regular fa-envelope"></i>${esc(c.email)}</span>` : ""}
          </div>
          <div class="clienta-acts">
            <button class="btn btn-ghost" data-wa="${esc(c.phone)}"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span></button>
          </div>
        </div>`;
    }).join("");
  } catch (e) {
    console.error("[recepcion] loadCards", e);
    $("#recCardsList").innerHTML = `
      <div class="empty" style="grid-column:1/-1;">
        <i class="fa-solid fa-circle-exclamation"></i>
        <strong>No se pudieron cargar las clientas</strong>
        Revisa la conexión e intenta de nuevo.
      </div>`;
  }
}

/* ============== SOLICITUDES ============== */
async function loadRequests() {
  try {
    const r = await fetch("/api/booking-requests");
    if (!r.ok) throw new Error("requests " + r.status);
    const p = await r.json();
    const list = (Array.isArray(p) ? p : (p.data || p.items || []))
      .filter((x) => !x.status || x.status === "pending" || x.status === "contacted");

    const badge = $("#recReqBadge");
    if (list.length) { badge.hidden = false; badge.textContent = String(list.length); }
    else { badge.hidden = true; }

    if (!list.length) {
      $("#recRequests").innerHTML = `
        <li class="empty">
          <i class="fa-regular fa-envelope-open"></i>
          <strong>Sin solicitudes pendientes</strong>
          Todo al día.
        </li>`;
      return;
    }
    $("#recRequests").innerHTML = list.map((req) => {
      const when = [req.preferredDate, req.preferredTime].filter(Boolean).join(" · ");
      return `
        <li class="req">
          <div>
            <div class="req-who">${esc(req.name || req.clientName || "Sin nombre")}</div>
            <div class="req-det">
              ${esc(req.phone || "")}${req.serviceName ? " · " + esc(req.serviceName) : ""}
              ${when ? " · " + esc(when) : ""}
              ${req.status === "contacted" ? ' · <span class="pill">Contactada</span>' : ""}
            </div>
            ${req.notes ? `<div class="req-det">${esc(req.notes)}</div>` : ""}
          </div>
          <div class="req-acts">
            <button class="btn btn-ghost" data-req-wa="${esc(req.phone)}"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp</span></button>
            <button class="btn btn-ghost" data-req-contact="${req.id}"><i class="fa-solid fa-phone"></i><span>Contactada</span></button>
            <button class="btn btn-ok" data-req-book="${req.id}"><i class="fa-regular fa-calendar-check"></i><span>Agendar</span></button>
            <button class="btn btn-danger" data-req-reject="${req.id}"><i class="fa-solid fa-xmark"></i><span>Rechazar</span></button>
          </div>
        </li>`;
    }).join("");
  } catch (e) {
    console.error("[recepcion] loadRequests", e);
    $("#recRequests").innerHTML = `
      <li class="empty">
        <i class="fa-solid fa-circle-exclamation"></i>
        <strong>No se pudieron cargar las solicitudes</strong>
      </li>`;
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
  }
}

/* ============== MODAL NUEVA CITA ============== */
let servicesCache = [];

async function loadServicesIntoSelect() {
  if (servicesCache.length) return;
  try {
    const r = await fetch("/api/services");
    const p = await r.json();
    servicesCache = (p.data || p || []).filter((s) => s.isActive !== false);
    const sel = $("#recApptService");
    sel.innerHTML = `<option value="" disabled selected>Selecciona</option>` +
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
         ${esc(c.name)}<span class="sub">${esc(c.phone || "sin teléfono")}</span>
       </button>`).join("");
    box.classList.add("show");
  } catch { box.classList.remove("show"); }
}

function activeCalDateOrToday() {
  return $('[data-pane="calendario"]').classList.contains("active") ? calDate : todayISO();
}
function openApptModal() {
  const dlg = $("#recApptDialog");
  $("#recApptForm").reset();
  $("#recApptErr").hidden = true;
  $("#recApptDate").value = activeCalDateOrToday();
  loadServicesIntoSelect();
  dlg.showModal();
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
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Agendando</span>`;
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
      errEl.hidden = false; return;
    }
    $("#recApptDialog").close();
    refreshCitasViews();
  } catch {
    errEl.textContent = "Error de red. Intenta de nuevo.";
    errEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fa-regular fa-calendar-plus"></i><span>Agendar</span>`;
  }
}

/* ============== WIRING ============== */
function wire() {
  $$(".tab").forEach((b) => b.addEventListener("click", () => activateTab(b.dataset.tab)));

  $("#recThemeToggle").addEventListener("click", toggleTheme);

  $("#recLogout").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    location.replace("/admin-login.html");
  });

  $("#recCitasHoy").addEventListener("click", handleCitaAction);
  $("#recCitasCal").addEventListener("click", handleCitaAction);

  $("#recDatePrev").addEventListener("click", () => shiftCalDate(-1));
  $("#recDateNext").addEventListener("click", () => shiftCalDate(1));
  $("#recDateToday").addEventListener("click", () => { calDate = todayISO(); loadCalendar(); });
  $("#recDatePick").addEventListener("change", (e) => { calDate = e.target.value; loadCalendar(); });

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

  $("#recRequests").addEventListener("click", handleRequestAction);
  $("#recReqRefresh").addEventListener("click", loadRequests);

  $$('[data-go="nueva-cita"]').forEach((b) => b.addEventListener("click", openApptModal));
  const closeDlg = () => $("#recApptDialog").close();
  $("#recApptCancel").addEventListener("click", closeDlg);
  $("#recApptCancel2").addEventListener("click", closeDlg);
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
    $("#recApptSuggest").classList.remove("show");
  });
}

/* ============== INIT ============== */
initTheme();
(async function init() {
  const me = await guardSession();
  if (!me) return;
  tickClock(); setInterval(tickClock, 20000);
  wire();
  loadCitasHoy();
  loadRequests();
  setInterval(() => {
    loadCitasHoy();
    if ($('[data-pane="whatsapp"]').classList.contains("active")) loadRequests();
  }, 60000);
})();

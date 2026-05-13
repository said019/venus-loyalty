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

function wireTabs() {
  $$(".rec-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      $$(".rec-tab").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".rec-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === tab));
    });
  });
}

function wireLogout() {
  $("#recLogout").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.replace("/admin-login.html");
  });
}

(async function init() {
  const me = await guardSession();
  if (!me) return;
  tickClock(); setInterval(tickClock, 30000);
  wireTabs();
  wireLogout();
  // Task 14 cargará citas de hoy aquí.
})();

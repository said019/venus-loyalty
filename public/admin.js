// /public/admin.js
const $ = (s, x=document)=>x.querySelector(s);
const $$ = (s, x=document)=>Array.from(x.querySelectorAll(s));

/* -------- auth bootstrap -------- */
(async function bootstrap(){
  try{
    const r = await fetch("/api/admin/me");
    if (r.status === 401) { location.href = "/admin-login.html"; return; }
    const me = await r.json();
    $("#me-line").textContent = `Sesión: ${me.email}`;
    initTabs();
    initOverview();
    initCards();
    initEvents();
    $("#logout").onclick = async ()=>{
      await fetch("/api/admin/logout", { method:"POST" });
      location.href = "/admin-login.html";
    };
  }catch{
    location.href = "/admin-login.html";
  }
})();

/* -------- tabs -------- */
function initTabs(){
  const tabs = $$(".nav a");
  const views = {
    overview: $("#tab-overview"),
    cards: $("#tab-cards"),
    events: $("#tab-events"),
    settings: $("#tab-settings"),
  };
  function go(hash){
    tabs.forEach(a=>a.classList.toggle("is-active", a.getAttribute("href") === hash));
    Object.values(views).forEach(v=>v.classList.add("hidden"));
    const id = (hash.replace("#","") || "overview");
    (views[id]||views.overview).classList.remove("hidden");
  }
  tabs.forEach(a=>a.onclick = (e)=>{ e.preventDefault(); history.replaceState({}, "", a.getAttribute("href")); go(a.getAttribute("href")); });
  go(location.hash || "#overview");
}

/* -------- overview (KPIs) -------- */
async function initOverview(){
  // Opcional: si no tienes endpoint de métricas, calculamos mínimos a partir de la primera página
  // Sugerido backend: GET /api/admin/metrics => {total, full, stampsToday, redeemsToday}
  let note = "";
  try{
    const r = await fetch("/api/admin/metrics");
    if(r.ok){
      const m = await r.json();
      $("#k_total").textContent = m.total;
      $("#k_full").textContent = m.full;
      $("#k_stamps").textContent = m.stampsToday;
      $("#k_redeems").textContent = m.redeemsToday;
      return;
    }
    note = "KPIs básicos estimados (sin endpoint de métricas).";
  }catch{ note = "KPIs estimados (sin endpoint de métricas)."; }

  // fallback mini-estimación: primera página de tarjetas
  const { items, total, page, totalPages } = await fetchCards({ page:1, q:"" });
  $("#k_total").textContent = total ?? "—";
  $("#k_full").textContent = items ? items.filter(x=>x.stamps >= x.max).length + (totalPages>1?"*":"") : "—";
  $("#k_stamps").textContent = "—";
  $("#k_redeems").textContent = "—";
  $("#kpi_note").textContent = note;
}

/* -------- cards -------- */
let currentPage = 1;
let currentQuery = "";
let fStatus = "";
let fCompleted = "";

function initCards(){
  $("#reload").onclick = ()=> loadCards();
  $("#export").onclick = ()=> exportCSV();
  $("#prev").onclick = ()=> { if(currentPage>1){ currentPage--; loadCards(); } };
  $("#next").onclick = ()=> { currentPage++; loadCards(); };
  $("#q").oninput = debounce(()=>{ currentQuery = $("#q").value.trim(); currentPage=1; loadCards(); }, 250);
  $("#f_status").onchange = ()=>{ fStatus = $("#f_status").value; currentPage=1; loadCards(); };
  $("#f_completed").onchange = ()=>{ fCompleted = $("#f_completed").value; currentPage=1; loadCards(); };
  $("#clearFilters").onclick = ()=>{
    $("#q").value = "";
    $("#f_status").value = "";
    $("#f_completed").value = "";
    currentQuery = ""; fStatus = ""; fCompleted = ""; currentPage=1; loadCards();
  };
  loadCards();
}

async function fetchCards({ page=1, q="" }){
  const url = new URL("/api/admin/cards", location.origin);
  url.searchParams.set("page", page);
  if(q) url.searchParams.set("q", q);
  // (Opcional) podrías añadir filtros al backend; por ahora filtramos en cliente
  const r = await fetch(url);
  if(!r.ok) throw new Error("No se pudo leer tarjetas");
  return r.json();
}

async function loadCards(){
  const { items, total, page, totalPages } = await fetchCards({ page: currentPage, q: currentQuery });
  let rows = items || [];
  // filtros cliente-side
  if(fStatus) rows = rows.filter(x=> String(x.status||"").toUpperCase() === fStatus);
  if(fCompleted) rows = rows.filter(x=> fCompleted==="yes" ? x.stamps>=x.max : x.stamps<x.max);

  const tbody = $("#cards-tbody");
  tbody.innerHTML = rows.map(r => {
    const completed = r.stamps >= r.max;
    return `
      <tr>
        <td><code>${r.id}</code></td>
        <td>${escapeHTML(r.name||"")}</td>
        <td>${r.stamps}</td>
        <td>${r.max}</td>
        <td>${r.status ? `<span class="tag">${r.status}</span>` : ""}</td>
        <td class="small">${fmtDate(r.created_at)}</td>
        <td class="small">
          <div class="tools">
            <button class="btn ghost" data-view="${r.id}">Ver</button>
            <button class="btn ghost" data-copy="${r.id}">Copiar ID</button>
            <a class="btn ghost" data-open="${r.id}">Abrir cliente</a>
            <button class="btn" data-stamp="${r.id}">+1 sello</button>
            <button class="btn ghost" data-redeem="${r.id}">Canjear</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  // eventos por fila
  tbody.onclick = (e)=>{
    const t = e.target.closest("button,a");
    if(!t) return;
    const id = t.dataset.view||t.dataset.copy||t.dataset.open||t.dataset.stamp||t.dataset.redeem;
    if(t.dataset.view) return openCard(id);
    if(t.dataset.copy) return navigator.clipboard.writeText(id);
    if(t.dataset.open) return window.open(`/?card=${encodeURIComponent(id)}`,"_blank");
    if(t.dataset.stamp) return actionStamp(id);
    if(t.dataset.redeem) return actionRedeem(id);
  };

  $("#pageinfo").textContent = `Página ${page} de ${totalPages} — ${total} registro(s)`;
}

async function openCard(cardId){
  // compone dialogo con QR + acciones
  $("#d_title").textContent = `Tarjeta ${cardId}`;
  $("#d_id").textContent = cardId;
  $("#d_open").href = `/?card=${encodeURIComponent(cardId)}`;
  $("#d_out").textContent = "";

  const shareUrl = `${location.origin}/?card=${encodeURIComponent(cardId)}`;
  $("#d_qr").src = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(shareUrl)}`;

  $("#d_copy").onclick = ()=> navigator.clipboard.writeText(cardId);
  $("#d_stamp").onclick = ()=> actionStamp(cardId, "#d_out");
  $("#d_redeem").onclick = ()=> actionRedeem(cardId, "#d_out");

  const dlg = $("#cardDialog");
  $("#d_close").onclick = ()=> dlg.close();
  dlg.showModal();
}

async function actionStamp(cardId, outSel){
  const out = outSel ? $(outSel) : null;
  try{
    const r = await fetch("/api/admin/stamp", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ cardId })
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || "No se pudo sumar sello");
    if(out){ out.textContent = "Sello agregado ✔︎"; out.className = "ok small"; }
    loadCards();
  }catch(err){
    if(out){ out.textContent = msgActionError(err); out.className = "err small"; }
    else alert(msgActionError(err));
  }
}

async function actionRedeem(cardId, outSel){
  const out = outSel ? $(outSel) : null;
  try{
    const r = await fetch("/api/admin/redeem", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ cardId })
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || "No se pudo canjear");
    if(out){ out.textContent = "Canje realizado ✔︎"; out.className = "ok small"; }
    loadCards();
  }catch(err){
    if(out){ out.textContent = msgActionError(err); out.className = "err small"; }
    else alert(msgActionError(err));
  }
}

function exportCSV(){
  const rows = $$("#cards-tbody tr").map(tr => {
    const tds = tr.querySelectorAll("td");
    return {
      id: tds[0].innerText.trim(),
      name: tds[1].innerText.trim(),
      stamps: tds[2].innerText.trim(),
      max: tds[3].innerText.trim(),
      status: tds[4].innerText.trim(),
      created_at: tds[5].innerText.trim()
    };
  });
  const header = "id,name,stamps,max,status,created_at";
  const data = rows.map(r => [r.id,r.name,r.stamps,r.max,r.status,r.created_at]
    .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([header+"\n"+data], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "venus_cards.csv";
  a.click();
}

/* -------- events -------- */
function initEvents(){
  $("#eload").onclick = async ()=>{
    const cardId = $("#eid").value.trim();
    if(!cardId) return;
    const url = new URL("/api/admin/events", location.origin);
    url.searchParams.set("cardId", cardId);
    const r = await fetch(url);
    const data = await r.json();
    const tbody = $("#events-tbody");
    if(!r.ok){ tbody.innerHTML = `<tr><td colspan="4" class="err small">${data.error||"No se pudieron cargar los eventos"}</td></tr>`; return; }
    tbody.innerHTML = (data.items||[]).map(ev=>{
      return `<tr>
        <td>${ev.id}</td>
        <td><span class="tag">${ev.type}</span></td>
        <td class="small"><code>${shortMeta(ev.meta)}</code></td>
        <td class="small">${fmtDate(ev.created_at)}</td>
      </tr>`;
    }).join("");
  };
}

/* -------- utils -------- */
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
function fmtDate(s){ try{ return new Date(s).toLocaleString(); }catch{ return s||""; } }
function shortMeta(m){ try{ return (JSON.stringify(JSON.parse(m))).slice(0,100); }catch{ return m?.slice?.(0,100)||""; } }
function escapeHTML(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function msgActionError(err){
  const msg = String(err.message||err);
  if(msg.includes("Solo 1 sello por día")) return "Regla: solo 1 sello por día.";
  if(msg.includes("card not found")) return "Tarjeta no encontrada.";
  if(msg.includes("not_implemented")) return "Acción no disponible: agrega las rutas /api/admin/stamp y /api/admin/redeem en el servidor.";
  return msg;
}

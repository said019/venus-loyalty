// /public/admin.js
const $ = (s,x=document)=>x.querySelector(s);

const viewAuth = $("#view-auth");
const viewDash = $("#view-dash");

const els = {
  // auth
  fLogin: $("#form-login"),
  fReg:   $("#form-register"),
  le:     $("#login-email"),
  lp:     $("#login-pass"),
  re:     $("#reg-email"),
  rp:     $("#reg-pass"),
  lout:   $("#login-out"),
  rout:   $("#reg-out"),
  meLine: $("#me-line"),
  logout: $("#logout"),

  // cards
  q: $("#q"),
  reload: $("#reload"),
  tbody: $("#cards-tbody"),
  pageinfo: $("#pageinfo"),
  prev: $("#prev"),
  next: $("#next"),

  // events
  eid: $("#eid"),
  eload: $("#eload"),
  etbody: $("#events-tbody")
};

let page = 1;
let q = "";

function fmtDate(s){ try{ return new Date(s).toLocaleString(); }catch{ return s; } }
function setAuthView(showDash){
  if(showDash){ viewAuth.classList.add("hidden"); viewDash.classList.remove("hidden"); }
  else        { viewDash.classList.add("hidden"); viewAuth.classList.remove("hidden"); }
}

async function api(path, init={}){
  const r = await fetch(path, { ...init, credentials:"include" });
  let data = null; try { data = await r.json(); } catch {}
  if(!r.ok) throw new Error((data && data.error) || `Error ${r.status}`);
  return data;
}

// ===== AUTH =====
async function checkMe(){
  try{
    const me = await api("/api/admin/me");
    els.meLine.textContent = `Sesión de ${me.email}`;
    setAuthView(true);
    await loadCards();
  }catch{
    setAuthView(false);
  }
}

els.fLogin?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  els.lout.textContent = "Entrando…";
  try{
    await api("/api/admin/login", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ email: els.le.value.trim(), password: els.lp.value })
    });
    els.lout.textContent = "";
    await checkMe();
  }catch(err){
    els.lout.textContent = err.message;
    els.lout.classList.add("err");
  }
});

els.fReg?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  els.rout.textContent = "Registrando…";
  try{
    await api("/api/admin/register", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ email: els.re.value.trim(), password: els.rp.value })
    });
    els.rout.textContent = "Cuenta creada. Ya puedes iniciar sesión.";
    els.rout.classList.add("ok");
  }catch(err){
    els.rout.textContent = err.message;
    els.rout.classList.add("err");
  }
});

els.logout?.addEventListener("click", async ()=>{
  await api("/api/admin/logout", { method:"POST" });
  location.reload();
});

// ===== CARDS =====
async function loadCards(){
  const data = await api(`/api/admin/cards?page=${page}&q=${encodeURIComponent(q)}`);
  els.tbody.innerHTML = "";
  data.items.forEach(c=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.id}</td>
      <td>${c.name}</td>
      <td>${c.stamps}</td>
      <td>${c.max}</td>
      <td>${c.status}</td>
      <td>${fmtDate(c.created_at)}</td>
    `;
    els.tbody.appendChild(tr);
  });
  els.pageinfo.textContent = `Página ${data.page} de ${data.totalPages} — ${data.total} tarjetas`;
  els.prev.disabled = data.page <= 1;
  els.next.disabled = data.page >= data.totalPages;
}

els.reload?.addEventListener("click", ()=>{ page=1; q=els.q.value.trim(); loadCards(); });
els.prev?.addEventListener("click", ()=>{ if(page>1){ page--; loadCards(); } });
els.next?.addEventListener("click", ()=>{ page++; loadCards(); });

// ===== EVENTS =====
els.eload?.addEventListener("click", async ()=>{
  const id = els.eid.value.trim();
  if(!id) return;
  const data = await api(`/api/admin/events?cardId=${encodeURIComponent(id)}`);
  els.etbody.innerHTML = "";
  data.items.forEach(e => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.id}</td>
      <td>${e.type}</td>
      <td><code>${e.meta || ""}</code></td>
      <td>${fmtDate(e.created_at)}</td>
    `;
    els.etbody.appendChild(tr);
  });
});

// init
checkMe();
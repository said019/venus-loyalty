// /public/app.js

// ===== helpers
const $  = (s, x=document) => x.querySelector(s);

function qs(name){
  const m = new URLSearchParams(location.search);
  return m.get(name);
}
function show(el){ el?.classList.remove('hidden'); }
function hide(el){ el?.classList.add('hidden'); }

function toast(msg){
  const out = $("#create-out");
  if(!out) return alert(msg);
  out.textContent = msg;
  out.classList.remove('err','ok');
  out.classList.add('ok');
  setTimeout(()=>{ out.textContent=''; out.classList.remove('ok'); }, 2500);
}

// ===== estado local
const state = {
  cardId: localStorage.getItem("venus.cardId") || qs("card") || null,
  lastStampsById: new Map(), // para animar sello nuevo y detectar completo
};

// --- Confeti minimalista (sin librerías) ---
function shootConfetti({ duration = 1200, particles = 120 } = {}) {
  const cvs = document.createElement('canvas');
  cvs.className = 'confetti-canvas';
  document.body.appendChild(cvs);
  const ctx = cvs.getContext('2d');

  function resize(){
    cvs.width = innerWidth;
    cvs.height = innerHeight;
  }
  resize(); window.addEventListener('resize', resize);

  const COLORS = ['#8c9668','#cdd8a6','#f0e7cf','#ffd166','#06d6a0','#ef476f'];
  const P = [];
  for(let i=0;i<particles;i++){
    P.push({
      x: Math.random()*cvs.width,
      y: -20,
      r: 2 + Math.random()*4,
      c: COLORS[Math.floor(Math.random()*COLORS.length)],
      vx: -2 + Math.random()*4,
      vy: 2 + Math.random()*3,
      g: 0.05 + Math.random()*0.12,
      a: 0.85 + Math.random()*0.15,
      life: duration + Math.random()*400
    });
  }
  let start = performance.now();
  function frame(t){
    const elapsed = t - start;
    ctx.clearRect(0,0,cvs.width,cvs.height);
    P.forEach(p=>{
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 16.6;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.a * (p.life/duration)));
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    });
    if(elapsed < duration){
      requestAnimationFrame(frame);
    }else{
      document.body.removeChild(cvs);
      window.removeEventListener('resize', resize);
    }
  }
  requestAnimationFrame(frame);
}

// ===== API
async function apiIssue({ name, max }){
  const r = await fetch("/api/issue", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ name, max })
  });
  const data = await r.json();
  if(!r.ok) throw new Error(data.error || "No se pudo crear");
  return data; // { cardId, addToGoogleUrl, addToAppleUrl }
}

async function apiGetCard(cardId){
  const r = await fetch(`/api/card/${encodeURIComponent(cardId)}`);
  const data = await r.json();
  if(!r.ok) throw new Error(data.error || "Tarjeta no encontrada");
  return data; // { id, name, stamps, max, ... }
}

async function apiWalletLink(cardId){
  const r = await fetch(`/api/wallet-link/${encodeURIComponent(cardId)}`);
  const data = await r.json();
  if(!r.ok) throw new Error(data.error || "Wallet link error");
  return data.addToGoogleUrl;
}

// ===== UI
function renderGrid(stamps, max, prevStamps=stamps){
  const g = $("#grid");
  g.innerHTML = "";
  for(let i=1;i<=max;i++){
    const b = document.createElement("div");
    const full = i <= stamps;
    b.className = "stamp" + (full ? " is-full" : "");
    // anima solo los sellos que pasaron de vacío a lleno
    if(full && i > prevStamps){
      b.classList.add("pulse");
      setTimeout(()=> b.classList.remove("pulse"), 700);
    }
    b.title = `Sello ${i} de ${max}`;
    g.appendChild(b);
  }
}

// === NUEVO: QR robusto con fallback automático ===
function setQR(cardId){
  const img = $("#qr");
  if (!img || !cardId) return;

  const shareUrl = `${location.origin}${location.pathname}?card=${encodeURIComponent(cardId)}`;
  const primary  = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}`;
  const fallback = `https://chart.googleapis.com/chart?chs=240x240&cht=qr&chld=M|0&chl=${encodeURIComponent(shareUrl)}`;

  img.loading = 'lazy';
  img.alt = 'QR';
  img.referrerPolicy = 'no-referrer';

  img.src = primary;
  img.onerror = () => {
    img.onerror = null; // evita bucles
    img.src = fallback;
  };

  const cid = $("#cid");
  if (cid) cid.textContent = cardId;
}

async function renderCardById(cardId){
  // lee tarjeta de API
  const card = await apiGetCard(cardId);
  // prev: último valor que conocíamos (sirve para animación y confeti)
  const prev = state.lastStampsById.get(cardId) ?? card.stamps;

  // header
  $("#c_name").textContent = card.name;
  $("#c_info").textContent = `Tienes ${card.stamps} de ${card.max} sellos`;

  // link Google Wallet
  const link = await apiWalletLink(card.id);
  const gbtn = $("#gwallet");
  if(gbtn) gbtn.href = link;

  // grid de sellos con animación
  renderGrid(card.stamps, card.max, prev);
  state.lastStampsById.set(cardId, card.stamps);

  // 🎉 Confeti SOLO cuando alcanza el máximo por primera vez
  if (card.stamps === card.max && prev < card.max) {
    shootConfetti({ duration: 1500, particles: 150 });
  }

  // QR + acciones
  setQR(card.id);

  const shareBtn = $("#share");
  if(shareBtn){
    shareBtn.onclick = async () => {
      const shareUrl = `${location.origin}${location.pathname}?card=${encodeURIComponent(card.id)}`;
      const title = "Mi tarjeta Venus Lealtad";
      try{
        if(navigator.share){
          await navigator.share({ title, text: "Aquí está mi tarjeta para sumar sellos:", url: shareUrl });
        }else{
          await navigator.clipboard.writeText(shareUrl);
          toast("Enlace copiado al portapapeles");
        }
      }catch{}
    };
  }

  const copyBtn = $("#copy");
  if(copyBtn){
    copyBtn.onclick = async () => {
      try{
        await navigator.clipboard.writeText(card.id);
        toast("ID copiado");
      }catch{}
    };
  }
}

function gotoCardView(){
  hide($("#view-create"));
  show($("#view-card"));
}

function gotoCreateView(){
  hide($("#view-card"));
  show($("#view-create"));
}

// ===== eventos
$("#create-form")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const name = ($("#name").value || "").trim() || "Cliente";
  const max  = parseInt($("#max").value, 10) || 8;
  const btn  = $("#create-form .btn");
  btn.disabled = true;
  try{
    const { cardId } = await apiIssue({ name, max });
    state.cardId = cardId;
    localStorage.setItem("venus.cardId", cardId);
    // al crear por primera vez, prev = 0
    state.lastStampsById.set(cardId, 0);
    await renderCardById(cardId);
    gotoCardView();
    toast("¡Tarjeta creada!");
  }catch(err){
    const out = $("#create-out");
    out.textContent = err.message;
    out.classList.remove('ok'); out.classList.add('err');
  }finally{
    btn.disabled = false;
  }
});

// ===== init
(async function init(){
  try{
    if(state.cardId){
      const c = await apiGetCard(state.cardId);
      state.lastStampsById.set(state.cardId, c.stamps);
      // pintar cabecera + botón Wallet antes de grid
      $("#c_name").textContent = c.name;
      $("#c_info").textContent = `Tienes ${c.stamps} de ${c.max} sellos`;
      const link = await apiWalletLink(c.id);
      const gbtn = $("#gwallet"); if(gbtn) gbtn.href = link;
      renderGrid(c.stamps, c.max, c.stamps);
      setQR(c.id);
      gotoCardView();
    }else{
      gotoCreateView();
    }
  }catch(err){
    console.warn(err);
    gotoCreateView();
  }
})();
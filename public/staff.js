// public/staff.js
const $  = (s,x=document)=>x.querySelector(s);

const els = {
  camera: $("#camera"),
  start : $("#start"),
  stop  : $("#stop"),
  switch: $("#switch"),
  video : $("#video"),
  out   : $("#scan-out"),
  manual: $("#manual"),
  load  : $("#load"),

  box   : $("#card-box"),
  empty : $("#card-empty"),
  name  : $("#c_name"),
  count : $("#c_count"),
  grid  : $("#c_grid"),
  id    : $("#c_id"),
  copy  : $("#copy"),
  stamp : $("#stamp"),
  redeem: $("#redeem"),
  msg   : $("#card-out"),
};

let currentId = null;
let stream = null, scanning = false, raf = 0, detector = null;
let canvas = null, ctx = null;
let cameras = [];
let camIndex = 0;

// Para animar cuál sello se llenó recién
const lastStampsById = new Map();

function toast(el, text, type=""){
  el.textContent = text;
  el.classList.remove("ok","err");
  if(type) el.classList.add(type);
  setTimeout(()=>{ el.textContent=""; el.classList.remove("ok","err"); }, 2400);
}

// === Cámaras ===
async function listCameras(){
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
    tmp.getTracks().forEach(t=>t.stop());
  } catch {}

  const devices = await navigator.mediaDevices.enumerateDevices();
  cameras = devices.filter(d => d.kind === "videoinput");

  els.camera.innerHTML = cameras.map((c,i) =>
    `<option value="${c.deviceId}">${c.label || `Cámara ${i+1}`}</option>`
  ).join("");

  camIndex = Math.max(0, els.camera.selectedIndex || 0);
  els.switch.disabled = cameras.length < 2;
}

async function startCamera(){
  try{
    const deviceId = (cameras[camIndex] && cameras[camIndex].deviceId) || els.camera.value || undefined;
    els.out.textContent = `Iniciando cámara… ${cameras[camIndex]?.label || ""}`;
    stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
      audio: false
    });
    els.video.srcObject = stream;
    await els.video.play();
    els.start.disabled = true;
    els.stop.disabled  = false;
    els.switch.disabled = cameras.length < 2;
    els.out.textContent = "Escaneando… apunta al QR del cliente";
    scanning = true;
    scanLoop();
  }catch(e){
    els.out.textContent = e?.message || "No se pudo iniciar la cámara (HTTPS requerido en producción).";
  }
}

function stopCamera(){
  scanning = false;
  cancelAnimationFrame(raf);
  try{ els.video.pause(); }catch{}
  if(stream){
    stream.getTracks().forEach(t=>t.stop());
    stream = null;
  }
  els.start.disabled = false;
  els.stop.disabled  = true;
  els.out.textContent = "Cámara detenida.";
}

async function switchCamera(){
  if(cameras.length < 2) return;
  camIndex = (camIndex + 1) % cameras.length;
  els.camera.selectedIndex = camIndex;
  if(stream){
    stopCamera();
    await startCamera();
  }
}

els.camera.addEventListener("change", async ()=>{
  camIndex = els.camera.selectedIndex;
  if(stream){
    stopCamera();
    await startCamera();
  }
});

// === Scan loop ===
async function scanLoop(){
  if(!scanning) return;
  raf = requestAnimationFrame(scanLoop);

  if('BarcodeDetector' in window){
    try{
      if(!detector) detector = new BarcodeDetector({ formats:["qr_code"] });
      const codes = await detector.detect(els.video);
      if(codes && codes.length){
        const raw = codes[0].rawValue || codes[0].rawData || "";
        const id  = extractCardId(raw);
        if(id) return onScan(id);
      }
    }catch{}
    return;
  }

  if(!canvas){
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
  }
  const vw = els.video.videoWidth || 640;
  const vh = els.video.videoHeight || 360;
  if(vw === 0 || vh === 0) return;

  canvas.width = vw;
  canvas.height = vh;
  ctx.drawImage(els.video, 0, 0, vw, vh);

  if(window.jsQR){
    const imgData = ctx.getImageData(0,0,vw,vh);
    const code = jsQR(imgData.data, vw, vh);
    if(code && code.data){
      const id = extractCardId(code.data);
      if(id) return onScan(id);
    }
  }
}

function extractCardId(text){
  if(!text) return null;
  try{
    const u = new URL(text);
    const q = new URLSearchParams(u.search);
    return q.get("card") || text;
  }catch{
    return text;
  }
}

async function onScan(id){
  if(currentId && currentId === id) return;
  currentId = id;
  stopCamera();
  await loadCard(id);
}

// === Carga/render tarjeta ===
async function loadCard(id){
  try{
    const r = await fetch(`/api/card/${encodeURIComponent(id)}`, { credentials: 'include' });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || "No encontrado");

    const prev = lastStampsById.get(id) ?? data.stamps;
    renderCard(data, prev);
    lastStampsById.set(id, data.stamps);

    toast(els.out, "Tarjeta cargada ✅", "ok");
  }catch(e){
    renderEmpty();
    toast(els.out, e.message || "Error al cargar", "err");
  }
}

function renderEmpty(){
  els.box.classList.add("hidden");
  els.empty.classList.remove("hidden");
  currentId = null;
}

function renderCard(card, prevStamps){
  els.empty.classList.add("hidden");
  els.box.classList.remove("hidden");

  els.name.textContent = card.name;
  els.count.textContent = `Sellos: ${card.stamps} / ${card.max}`;
  els.id.textContent = card.id;

  els.grid.innerHTML = "";
  for(let i=1;i<=card.max;i++){
    const d = document.createElement("div");
    const isFull = i <= card.stamps;
    d.className = "stamp-pip" + (isFull ? " full" : "");
    if(isFull && i > prevStamps){
      d.classList.add("pulse");               // animación
      setTimeout(()=> d.classList.remove("pulse"), 650);
    }
    els.grid.appendChild(d);
  }

  els.stamp.disabled  = (card.stamps >= card.max);
  els.redeem.disabled = !(card.stamps >= card.max);
}

// === Acciones ===
els.copy.addEventListener("click", async ()=>{
  if(!currentId) return;
  try{
    await navigator.clipboard.writeText(currentId);
    toast(els.msg,"ID copiado","ok");
  }catch{}
});

els.load.addEventListener("click", async ()=>{
  const id = (els.manual.value || "").trim();
  if(!id) return toast(els.out, "Ingresa un Card ID", "err");
  await loadCard(id);
});

// *** Handler corregido: sumar sello leyendo tarjeta fresca ***
els.stamp.addEventListener("click", async () => {
  if (!currentId) return;
  els.stamp.disabled = true;
  try {
    // 1) Cuántos tenía antes (para animar el nuevo)
    const prev = lastStampsById.get(currentId) ?? 0;

    // 2) Sumar en backend
    const r = await fetch(`/api/stamp/${encodeURIComponent(currentId)}`, {
      method: "POST",
      credentials: "include"
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "No se pudo sumar");

    // 3) Leer tarjeta actualizada (fresca y consistente)
    const cr = await fetch(`/api/card/${encodeURIComponent(currentId)}`, { credentials: "include" });
    const card = await cr.json();
    if (!cr.ok) throw new Error(card.error || "No se pudo leer la tarjeta");

    // 4) Render con animación desde 'prev'
    renderCard(card, prev);
    lastStampsById.set(currentId, card.stamps);

    toast(els.msg, "Sello agregado ✅", "ok");
  } catch (e) {
    toast(els.msg, e.message || "Error al sumar", "err");
  } finally {
    els.stamp.disabled = false;
  }
});

// *** Handler mejorado: canje con lectura fresca ***
els.redeem.addEventListener("click", async ()=>{
  if(!currentId) return;
  if(!confirm("Confirmar canje (reinicia a 0 sellos)")) return;
  try{
    const r = await fetch(`/api/redeem/${encodeURIComponent(currentId)}`, {
      method: "POST",
      credentials: "include"
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || "No se pudo canjear");

    // lee tarjeta fresca (debería quedar en 0)
    const cr = await fetch(`/api/card/${encodeURIComponent(currentId)}`, { credentials: "include" });
    const card = await cr.json();
    if(!cr.ok) throw new Error(card.error || "No se pudo leer la tarjeta");

    lastStampsById.set(currentId, card.stamps);
    renderCard(card, card.stamps); // sin pulso (ya quedó en 0)

    toast(els.msg, "Canje realizado 🎁", "ok");
  }catch(e){
    toast(els.msg, e.message || "Error al canjear", "err");
  }
});

// === Eventos cámara ===
els.start.addEventListener("click", startCamera);
els.stop.addEventListener("click", stopCamera);
els.switch.addEventListener("click", switchCamera);

// init
(async function init(){
  if(!('mediaDevices' in navigator)){
    els.out.textContent = "Tu navegador no soporta cámara.";
    els.start.disabled = true;
    return;
  }
  await listCameras();
})();
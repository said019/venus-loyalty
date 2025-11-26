// Utilidades
const $ = (s, x = document) => x.querySelector(s);
const $$ = (s, x = document) => [...x.querySelectorAll(s)];
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); }
  catch { return iso; }
}
function toast(el, msg, ok = true) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("err", "ok");
  el.classList.add(ok ? "ok" : "err");
  setTimeout(() => {
    el.textContent = "";
    el.classList.remove("ok", "err");
  }, 2000);
}

// Tabs
// Tabs
function switchView(viewId) {
  $$('.nav a').forEach(x => {
    const href = x.getAttribute('href');
    x.classList.toggle('is-active', href === '#' + viewId);
  });
  ['overview', 'cards', 'events', 'settings'].forEach(t => {
    $('#tab-' + t).classList.toggle('hidden', t !== viewId);
  });
}
window.switchView = switchView; // Make it globally available

$$('[data-tab]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const id = a.getAttribute('href')?.replace('#', '') || 'overview';
    switchView(id);
  });
});


// ====== Sesión (admin) ======
async function me() {
  const r = await fetch("/api/admin/me");
  if (!r.ok) {
    location.href = "/admin-login.html";
    return;
  }
  const j = await r.json();
  $("#me-line").textContent = `Sesión: ${j.email}`;
}
$("#logout").onclick = async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  location.href = "/admin-login.html";
};
me();

// ====== KPIs ======
async function loadKpis() {
  try {
    const r = await fetch("/api/admin/metrics");
    if (!r.ok) throw 0;
    const m = await r.json();
    $("#k_total").textContent = m.total ?? "—";
    $("#k_full").textContent = m.full ?? "—";
    $("#k_stamps").textContent = m.stampsToday ?? "—";
    $("#k_redeems").textContent = m.redeemsToday ?? "—";
    $("#kpi_note").textContent =
      "Actualizado " + new Date().toLocaleTimeString();
  } catch {
    /* silencioso */
  }
}
loadKpis();

// ====== Tabla de tarjetas ======
let page = 1;
async function loadCards() {
  const q = $("#q").value.trim();
  const r = await fetch(
    `/api/admin/cards?page=${page}&q=${encodeURIComponent(q)}`
  );
  const j = await r.json();
  const tb = $("#cards-tbody");
  tb.innerHTML = "";
  for (const c of j.items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${c.id}</code></td>
      <td>${c.name}</td>
      <td>${c.stamps}</td>
      <td>${c.max}</td>
      <td><span class="tag">${c.status || "active"}</span></td>
      <td>${fmtDate(c.created_at)}</td>
      <td class="row">
        <button class="btn ghost btn-view" data-id="${c.id}">Ver</button>
        <button class="btn ghost btn-copy" data-id="${c.id}">Copiar ID</button>
        <button class="btn ghost btn-open" data-id="${c.id}">Abrir cliente</button>
        <button class="btn" data-act="stamp" data-id="${c.id}">+1 sello</button>
        <button class="btn ghost" data-act="redeem" data-id="${c.id}">Canjear</button>
      </td>`;
    tb.appendChild(tr);
  }
  $("#pageinfo").textContent = `Página ${j.page} de ${j.totalPages} — ${j.total} registro(s)`;

  // acciones
  tb.querySelectorAll(".btn-view").forEach(
    (b) => (b.onclick = () => openCardDialog(b.dataset.id))
  );
  tb.querySelectorAll(".btn-copy").forEach(
    (b) => (b.onclick = () =>
      navigator.clipboard.writeText(b.dataset.id))
  );
  tb.querySelectorAll(".btn-open").forEach(
    (b) =>
    (b.onclick = () =>
      window.open(`/?card=${encodeURIComponent(b.dataset.id)}`, "_blank"))
  );
  tb.querySelectorAll('[data-act="stamp"]').forEach(
    (b) => (b.onclick = () => adminAction("stamp", b.dataset.id))
  );
  tb.querySelectorAll('[data-act="redeem"]').forEach(
    (b) => (b.onclick = () => adminAction("redeem", b.dataset.id))
  );
}
$("#reload").onclick = () => loadCards();
$("#prev").onclick = () => {
  page = Math.max(1, page - 1);
  loadCards();
};
$("#next").onclick = () => {
  page = page + 1;
  loadCards();
};
$("#q").addEventListener("input", () => {
  page = 1;
  loadCards();
});
loadCards();

// ====== Diálogo de tarjeta ======
const dlg = $("#cardDialog");
$("#d_close").onclick = () => dlg.close();

async function openCardDialog(cardId) {
  dlg.showModal();
  $("#d_title").textContent = "Tarjeta " + cardId;
  $("#d_body").textContent = "Cargando…";
  try {
    const r = await fetch("/api/card/" + encodeURIComponent(cardId));
    const c = await r.json();
    $("#d_body").innerHTML = `
      <div><b>Cliente:</b> ${c.name}</div>
      <div><b>Sellos:</b> ${c.stamps} / ${c.max}</div>
      <div><b>Status:</b> <span class="tag">${c.status || "active"}</span></div>
      <div><b>Creada:</b> ${fmtDate(c.created_at)}</div>
    `;
    $("#d_id").value = c.id;
    $("#d_open").href = `/?card=${encodeURIComponent(c.id)}`;

    // QR que **siempre carga** (Google Chart)
    const shareUrl = `${location.origin}/?card=${encodeURIComponent(c.id)}`;
    $("#d_qr").src =
      "https://chart.googleapis.com/chart?cht=qr&chs=240x240&chld=M|0&chl=" +
      encodeURIComponent(shareUrl);

    $("#d_copy").onclick = () => navigator.clipboard.writeText(c.id);
    $("#d_stamp").onclick = () => adminAction("stamp", c.id, true);
    $("#d_redeem").onclick = () => adminAction("redeem", c.id, true);
  } catch (e) {
    $("#d_body").textContent = String(e?.message || e) || "Error";
  }
}

// confeti minimalista
function confettiQuick() {
  const cvs = document.createElement("canvas");
  document.body.appendChild(cvs);
  const ctx = cvs.getContext("2d");
  cvs.style.position = "fixed";
  cvs.style.inset = 0;
  cvs.style.pointerEvents = "none";
  cvs.width = innerWidth;
  cvs.height = innerHeight;
  const P = Array.from({ length: 140 }, () => ({
    x: Math.random() * cvs.width,
    y: -20,
    r: 2 + Math.random() * 4,
    vx: -2 + Math.random() * 4,
    vy: 2 + Math.random() * 3,
    g: 0.06,
    c: ["#8c9668", "#cdd8a6", "#ffd166", "#06d6a0", "#ef476f"][
      Math.floor(Math.random() * 5)
    ],
  }));
  let t = 0;
  (function f() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    P.forEach((p) => {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    if ((t += 16) < 1400) requestAnimationFrame(f);
    else cvs.remove();
  })();
}

async function adminAction(kind, cardId, fromDialog = false) {
  const url = kind === "stamp" ? "/api/admin/stamp" : "/api/admin/redeem";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId }),
  });
  const out = $("#d_out");
  if (r.ok) {
    await r.json().catch(() => ({}));
    out && (out.textContent =
      kind === "stamp" ? "✅ Sello agregado" : "🎁 Canje realizado");

    if (kind === "stamp") {
      try {
        const c = await (
          await fetch("/api/card/" + encodeURIComponent(cardId))
        ).json();
        if (c.stamps >= c.max) confettiQuick();
      } catch { }
    }
    if (fromDialog) {
      openCardDialog(cardId);
    }
    loadCards();
    loadKpis();
  } else {
    const e = await r.json().catch(() => ({ error: "Error" }));
    out && (out.textContent = "⚠️ " + (e.error || "Error"));
  }
}

// ====== Eventos ======
$("#eload").onclick = async () => {
  const id = $("#eid").value.trim();
  if (!id) return;
  const r = await fetch(
    "/api/admin/events?cardId=" + encodeURIComponent(id)
  );
  const j = await r.json();
  const tb = $("#events-tbody");
  tb.innerHTML = "";
  for (const ev of j.items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${ev.id}</td><td>${ev.type}</td><td><code>${ev.meta}</code></td><td>${fmtDate(
      ev.created_at
    )}</td>`;
    tb.appendChild(tr);
  }
};

// ====== Export ======
$("#export").onclick = () => window.open("/api/export.csv", "_blank");

// ====== Escáner QR integrado ======
const sdlg = $("#scanDialog");
const sOut = $("#scan_out");
const video = $("#scan_video");
const camSel = $("#scan_cameras");
let stream = null;
let raf = 0;
let detector = null;
let usingBarcode = "BarcodeDetector" in window;

async function listCameras() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  const cams = devs.filter((d) => d.kind === "videoinput");
  camSel.innerHTML = "";
  cams.forEach((c, i) => {
    const opt = document.createElement("option");
    opt.value = c.deviceId;
    opt.textContent = c.label || `Cámara ${i + 1}`;
    camSel.appendChild(opt);
  });
}

async function startScan() {
  try {
    stream && stream.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: camSel.value ? { exact: camSel.value } : undefined,
        facingMode: "environment",
      },
    });
    video.srcObject = stream;
    await video.play();
    $("#scan_stop").disabled = false;
    $("#scan_start").disabled = true;
    sOut.textContent = "Apunta al QR del cliente…";

    if (usingBarcode) {
      detector = new BarcodeDetector({ formats: ["qr_code"] });
      loopBarcode();
    } else {
      const s = document.createElement("script");
      s.src =
        "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
      await new Promise((r) => {
        s.onload = r;
        document.head.appendChild(s);
      });
      loopJsQR();
    }
  } catch (e) {
    sOut.textContent =
      "No se pudo iniciar la cámara: " + (e.message || e);
  }
}
function stopScan() {
  cancelAnimationFrame(raf);
  stream && stream.getTracks().forEach((t) => t.stop());
  stream = null;
  $("#scan_stop").disabled = true;
  $("#scan_start").disabled = false;
}
async function loopBarcode() {
  if (!stream) return;
  try {
    const det = await detector.detect(video);
    if (det && det[0]) {
      handleScan(det[0].rawValue);
      return;
    }
  } catch { }
  raf = requestAnimationFrame(loopBarcode);
}
function loopJsQR() {
  if (!stream) return;
  const cvs = document.createElement("canvas"),
    ctx = cvs.getContext("2d");
  cvs.width = video.videoWidth;
  cvs.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, cvs.width, cvs.height);
  const img = ctx.getImageData(0, 0, cvs.width, cvs.height);
  if (window.jsQR) {
    const code = jsQR(img.data, cvs.width, cvs.height);
    if (code && code.data) {
      handleScan(code.data);
      return;
    }
  }
  raf = requestAnimationFrame(loopJsQR);
}
function extractCardId(text) {
  try {
    const u = new URL(text);
    const c = u.searchParams.get("card");
    if (c) return c;
  } catch { }
  if (/^card_\d+/.test(text)) return text;
  return null;
}
async function handleScan(value) {
  stopScan();
  const cid = extractCardId(value);
  if (!cid) {
    sOut.textContent = "QR inválido.";
    return;
  }
  sOut.textContent = "Encontrado: " + cid;
  sdlg.close();
  openCardDialog(cid);
}

$("#scan").onclick = async () => {
  sdlg.showModal();
  await listCameras();
};
$("#scan_close").onclick = () => {
  stopScan();
  sdlg.close();
};
$("#scan_start").onclick = startScan;
$("#scan_stop").onclick = stopScan;
camSel.onchange = () => stream && startScan();

// ====== Gift Cards (Eventos & Gift cards) ======
const giftForm = $("#gift-form");
const giftPreview = $("#gift-preview");
const giftQr = $("#gift-qr");
const giftTitle = $("#gift-preview-title");
const giftSub = $("#gift-preview-sub");
const giftExp = $("#gift-preview-exp");

// botones opcionales (si los agregas en el HTML)
const giftCopyBtn = $("#gift-copy");
const giftWaLink = $("#gift-wa");
const giftMsg = $("#gift-msg");

let lastGiftText = "";
let lastGiftCode = "";

function addDays(base, days) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}
function formatDateShort(d) {
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

if (giftForm) {
  giftForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = $("#gift-name").value.trim();
    const service =
      $("#gift-service").value.trim() || "Servicio Venus";

    const today = new Date();
    const expiry = addDays(today, 30);
    const expLabel = formatDateShort(expiry);
    const code = "gift_" + Date.now();

    lastGiftCode = code;

    // Texto visual
    giftTitle && (giftTitle.textContent = service);
    giftSub &&
      (giftSub.textContent = name ? `Para: ${name}` : "Para: Invitado");
    giftExp &&
      (giftExp.textContent = "Vigencia hasta: " + expLabel);

    // Payload para el QR (se puede usar después en backend)
    const payload =
      `GIFT|codigo=${code}|servicio=${service}|cliente=${name || "Invitado"}|vence=${expiry.toISOString().slice(0, 10)}`;

    const qrUrl =
      "https://chart.googleapis.com/chart?cht=qr&chs=260x260&chld=M|0&chl=" +
      encodeURIComponent(payload);
    if (giftQr) {
      giftQr.src = qrUrl;
      giftQr.alt = "QR Gift Card";
    }

    giftPreview && giftPreview.classList.remove("hidden");

    // Texto para compartir
    lastGiftText =
      `Te regalo una Gift Card de Venus Cosmetología.\n` +
      `Servicio: ${service}\n` +
      (name ? `A nombre de: ${name}\n` : "") +
      `Vigente hasta: ${expLabel}\n` +
      `Código: ${code}`;

    if (giftWaLink) {
      const waUrl = "https://wa.me/?text=" + encodeURIComponent(lastGiftText);
      giftWaLink.href = waUrl;
      giftWaLink.style.display = "inline-flex";
    }

    if (giftMsg) {
      giftMsg.textContent =
        "Gift Card generada. Puedes compartir por WhatsApp o copiar el texto.";
    }
  });
}

giftCopyBtn &&
  giftCopyBtn.addEventListener("click", () => {
    if (!lastGiftText) return;
    navigator.clipboard
      .writeText(lastGiftText)
      .then(() => {
        if (giftMsg) {
          giftMsg.textContent = "Texto copiado al portapapeles ✅";
          setTimeout(() => (giftMsg.textContent = ""), 2000);
        }
      })
      .catch(() => {
        if (giftMsg) {
          giftMsg.textContent = "No se pudo copiar el texto";
        }
      });
  });
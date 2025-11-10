// public/admin-login.js

const $  = (s, x=document) => x.querySelector(s);
const show = el => el?.classList.remove("hidden");
const hide = el => el?.classList.add("hidden");

function setToast(el, type, msg){
  el.classList.remove("ok","err");
  if (!msg) { el.style.display = "none"; el.textContent = ""; return; }
  el.textContent = msg;
  el.classList.add(type === "ok" ? "ok" : "err");
  el.style.display = "block";
}

function goPanel(){
  location.href = "/admin";
}

function selectTab(tab){
  const tabs = ["login","register","forgot","reset"];
  tabs.forEach(t=>{
    const view = $(`#view-${t}`);
    const tabA = $(`#tab-${t}`);
    if (t === tab){
      show(view);
      tabA?.classList.add("active");
    } else {
      hide(view);
      tabA?.classList.remove("active");
    }
  });
  // si entramos a reset, muestra la pestaña reset
  if (tab === "reset") show($("#tab-reset"));
}

function currentHash(){
  return (location.hash || "#login").replace("#","");
}

async function postJSON(url, body){
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(data.error || "Error");
  return data;
}

// init tabs
function parseTokenFromHash(){
  const h = location.hash || "";
  if (h.startsWith("#reset")) {
    const qp = new URLSearchParams(h.split("?")[1] || "");
    return qp.get("token");
  }
  return null;
}

function init(){
  const tab = currentHash();
  selectTab(tab);

  const token = parseTokenFromHash();
  if (token){
    $("#reset-token").value = token;
  }
}

window.addEventListener("hashchange", init);
init();

// ===== Forms =====

// Login
$("#form-login")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const out = $("#login-toast");
  setToast(out, "ok", "Enviando...");
  try {
    const email = $("#login-email").value.trim();
    const password = $("#login-pass").value;
    await postJSON("/api/admin/login", { email, password });
    setToast(out, "ok", "Acceso correcto. Entrando...");
    setTimeout(goPanel, 600);
  } catch (err){
    setToast(out, "err", err.message || "Credenciales inválidas");
  }
});

// Registro
$("#form-register")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const out = $("#reg-toast");
  setToast(out, "ok", "Creando cuenta...");
  try {
    const email = $("#reg-email").value.trim();
    const password = $("#reg-pass").value;
    await postJSON("/api/admin/register", { email, password });
    setToast(out, "ok", "Cuenta creada. Ahora inicia sesión.");
    setTimeout(()=> location.hash = "#login", 900);
  } catch (err){
    let msg = err.message;
    if (msg === "signup_disabled") msg = "El registro está deshabilitado.";
    if (msg === "email_in_use") msg = "Ese correo ya está en uso.";
    setToast(out, "err", msg || "No se pudo crear la cuenta.");
  }
});

// Forgot
$("#form-forgot")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const out = $("#forgot-toast");
  setToast(out, "ok", "Enviando enlace…");
  try {
    const email = $("#forgot-email").value.trim();
    await postJSON("/api/admin/forgot", { email });
    setToast(out, "ok", "Si el correo existe, recibirás un enlace en unos instantes.");
  } catch (err){
    setToast(out, "err", err.message || "Error al enviar el correo.");
  }
});

// Reset
$("#form-reset")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const out = $("#reset-toast");
  setToast(out, "ok", "Actualizando contraseña…");
  try {
    const token = $("#reset-token").value;
    const password = $("#reset-pass").value;
    await postJSON("/api/admin/reset", { token, password });
    setToast(out, "ok", "Contraseña actualizada. Ahora inicia sesión.");
    setTimeout(()=> location.hash = "#login", 900);
  } catch (err){
    let msg = err.message;
    if (msg === "invalid_token") msg = "El enlace no es válido.";
    if (msg === "expired_token") msg = "El enlace expiró, solicita uno nuevo.";
    setToast(out, "err", msg || "No se pudo actualizar la contraseña.");
  }
});
async function api(url, opts){
  const res = await fetch(url, opts);
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

function el(id){ return document.getElementById(id); }

function renderGrid(stamps, max){
  const grid = el("grid");
  grid.innerHTML = "";
  for(let i=1;i<=max;i++){
    const d = document.createElement("div");
    d.className = "dot" + (i<=stamps ? " filled":"");
    d.textContent = i<=stamps ? "✓" : i;
    grid.appendChild(d);
  }
}

function setQR(cardId){
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(cardId)}`;
  el("qr").src = url;
  el("cid").textContent = cardId;
  el("copy").onclick = async () => {
    await navigator.clipboard.writeText(cardId);
    el("copy").textContent = "Copiado";
    setTimeout(()=> el("copy").textContent = "Copiar", 1200);
  };
}

async function showCard(cardId){
  const response = await api(`/api/card/${cardId}`);
  const card = response.success ? response.data : response;
  el("c_name").textContent = card.name;
  el("c_info").textContent = `Progreso: ${card.stamps}/${card.max}`;
  renderGrid(card.stamps, card.max);
  setQR(cardId);

  // Pide un link fresco de Wallet para ESTA tarjeta (endpoint que añadiremos);
  // si aún no lo agregas, el botón se deshabilita.
  try{
    const { addToGoogleUrl } = await api(`/api/wallet-link/${cardId}`);
    const a = el("gwallet");
    a.href = addToGoogleUrl;
    a.textContent = "Guardar en Google Wallet";
  }catch{
    const a = el("gwallet");
    a.href = "#";
    a.textContent = "Wallet no disponible";
    a.classList.add("btn--ghost");
  }

  // Share
  el("share").onclick = async ()=>{
    const shareUrl = `${location.origin}${location.pathname}?cardId=${encodeURIComponent(cardId)}`;
    if(navigator.share){
      await navigator.share({ title: "Mi tarjeta Venus", text: "Esta es mi tarjeta de lealtad", url: shareUrl});
    }else{
      await navigator.clipboard.writeText(shareUrl);
      el("share").textContent = "Enlace copiado";
      setTimeout(()=> el("share").textContent = "Compartir", 1200);
    }
  }

  el("view-create").classList.add("hidden");
  el("view-card").classList.remove("hidden");
}

async function main(){
  const p = new URLSearchParams(location.search);
  const cardId = p.get("cardId");

  if(cardId){
    showCard(cardId).catch(err=>{
      el("view-card").classList.add("hidden");
      el("view-create").classList.remove("hidden");
      el("create-out").textContent = "No encontramos tu tarjeta. Puedes crear una nueva.";
    });
  }else{
    el("view-create").classList.remove("hidden");
  }

  // Crear tarjeta
  el("create-form").onsubmit = async (e)=>{
    e.preventDefault();
    const name = el("name").value.trim() || "Cliente";
    const max = parseInt(el("max").value, 10) || 8;

    try{
      const out = await api("/api/issue", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ name, max })
      });
      // Redirige para cargar la vista de la tarjeta recién creada
      location.href = `${location.pathname}?cardId=${encodeURIComponent(out.cardId)}`;
    }catch(err){
      el("create-out").textContent = err.message || String(err);
    }
  };
}

main();
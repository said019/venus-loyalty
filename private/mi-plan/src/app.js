import {foods,recipes,slots,menuForDate,groupNames} from './data.js';
import {dateKey,isDateKey,proposeSwap,effectiveIngredients,shoppingList,formatQuantity} from './engine.js';
import {createStore} from './storage.js';
let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}};}
const store=createStore(storage),app=document.querySelector('#app'),dialog=document.querySelector('#detail'),content=document.querySelector('#dialog-content');
let day=dateKey(new Date()),tab='hoy',current=null,shoppingDays=new Set([day]),returnFocus=null;
function selectDay(value){day=value;}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qty=i=>i.quantity==null?'Cantidad no indicada':`${formatQuantity(i.quantity)} ${i.unit}`;
const recipe=id=>recipes.find(r=>r.id===id);
const changes=r=>store.data.changes[day]?.[r.id]||{};
const effective=r=>effectiveIngredients(r,changes(r),foods);
const pretty=d=>new Date(d+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'});
function dates(){const d=new Date(day+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));return Array.from({length:7},(_,i)=>{const x=new Date(d);x.setDate(d.getDate()+i);return dateKey(x);});}
function persist(){store.save();document.querySelector('#notice').textContent=store.warning;}
let toastTimer;function toast(text){clearTimeout(toastTimer);document.querySelector('#toast').textContent=text;toastTimer=setTimeout(()=>document.querySelector('#toast').textContent='',4000);}
function frame(title,subtitle){return `<div class="intro"><div><h1>${title}</h1><p class="muted">${subtitle}</p></div><label class="date-label">Día del plan<input aria-label="Día del plan" id="date" type="date" value="${day}"></label></div>`;}
function week(){return `<div class="week">${dates().map(d=>`<button class="${d===day?'selected':''}" data-day="${d}" aria-pressed="${d===day}">${new Date(d+'T12:00:00').toLocaleDateString('es-MX',{weekday:'short'})}<strong>${Number(d.slice(-2))}</strong></button>`).join('')}</div>`;}
function meal(r){const done=store.data.done[day]?.[r.id]===true;return `<div class="meal"><time>${slots[r.slot][1]}</time><div><small>${slots[r.slot][0]}</small><button class="title" data-recipe="${r.id}">${esc(r.title)}</button>${r.warning?'<span class="badge">Incluye una aclaración del plan</span>':''}${effective(r).some(i=>i.swapped)?'<span class="badge"> · Con cambio confirmado</span>':''}</div><button class="check ${done?'checked':''}" data-done="${r.id}" aria-label="${done?'Desmarcar':'Marcar como comido'}: ${esc(r.title)}" aria-pressed="${done}">${done?'✓':'○'}</button></div>`;}
function render(){
 document.querySelectorAll('nav button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
 document.querySelector('#notice').textContent=store.warning;
 if(tab==='hoy'){
 const menu=menuForDate(day),now=new Date(),time=now.getHours()*60+now.getMinutes();
 const next=menu.find(r=>!store.data.done[day]?.[r.id]&&(day!==dateKey(now)||Number(slots[r.slot][1].slice(0,2))*60>=time))||menu.find(r=>!store.data.done[day]?.[r.id])||menu[0];
 app.innerHTML=frame('¿Qué toca hoy?','Tu plan, una comida a la vez.')+week()+`<section class="hero"><div class="hero-art" aria-hidden="true"><div class="plate">a tu<br>ritmo</div><small>Tu receta, sin fotografías de porciones</small></div><div class="hero-copy"><div class="eyebrow">${slots[next.slot][1]} · ${slots[next.slot][0]}</div><h2>${esc(next.title)}</h2><p class="muted">Consulta los ingredientes y las cantidades de tu plan.</p><button class="primary" data-recipe="${next.id}">Ver receta</button></div></section><h3>El resto de tu día</h3>${menu.map(meal).join('')}`;
 }else if(tab==='semana'){
 app.innerHTML=frame('Tu semana','El menú original, organizado por día.')+dates().map(d=>`<section class="section"><h3>${esc(pretty(d))}</h3>${menuForDate(d).map(r=>`<div class="meal"><time>${slots[r.slot][1]}</time><button class="title" data-open-day="${d}" data-id="${r.id}">${esc(r.title)}</button></div>`).join('')}</section>`).join('');
 }else if(tab==='compras'){renderShopping();}else{renderPlan();}
}
function renderShopping(){
 const entries=[...shoppingDays].filter(isDateKey).flatMap(d=>menuForDate(d).map(r=>({recipe:r,changes:store.data.changes[d]?.[r.id]||{}})));
 const rows=shoppingList(entries,foods);
 app.innerHTML=frame('Lista de compras','Selecciona los días que vas a preparar.')+`<div class="actions"><button id="shop-week">Seleccionar toda la semana</button><button id="shop-clear">Quitar selección</button></div><p><strong>Total para ${shoppingDays.size} días · ${entries.length} comidas</strong></p><p class="muted">${[...shoppingDays].sort().map(d=>esc(pretty(d))).join(' · ')}</p><div class="days-list">${dates().map(d=>`<label><input type="checkbox" data-shop-day="${d}" ${shoppingDays.has(d)?'checked':''}>${esc(new Date(d+'T12:00:00').toLocaleDateString('es-MX',{weekday:'short',day:'numeric'}))}</label>`).join('')}</div><p class="muted">Marca lo que ya tienes en casa. Los cambios pendientes no modifican esta lista.</p>${entries.some(e=>e.recipe.warning)?'<div class="warning">Algunas recetas tienen aclaraciones pendientes. La lista suma las cantidades del plan y los cambios confirmados; no corrige las diferencias del documento.</div>':''}${!rows.length?'<p class="empty">Elige al menos un día para reunir sus ingredientes.</p>':['Ingredientes','Opcionales'].map((title,k)=>`<section class="section"><h3>${title}</h3>${rows.filter(x=>Boolean(x.optional)===Boolean(k)).map(row=>`<label class="shopping-row"><input type="checkbox" data-pantry="${esc(row.key)}" ${store.data.pantry[row.key]===true?'checked':''}><span>${esc(row.name)}${row.prep==='unknown'?'<small> · El plan no indica crudo o cocido</small>':''}</span><em>Total: ${esc(qty(row))}</em></label>`).join('')||'<small>No hay ingredientes en este grupo.</small>'}</section>`).join('')}<div class="actions"><button class="primary" id="copy-list" ${rows.length?'':'disabled'}>Copiar lista</button></div><textarea id="copy-fallback" aria-label="Lista para copiar" hidden></textarea>`;
}
function renderPlan(){
 const pendings=Object.entries(store.data.pending).flatMap(([date,items])=>Object.entries(items).map(([key,p])=>({date,key,p}))).filter(x=>x.p&&typeof x.p==='object'&&foods[x.p.target]);
 app.innerHTML=`<div class="eyebrow">TU ESPACIO PERSONAL</div><h1>Mi plan</h1><p class="plan-note">Esta es una transcripción de tu plan, no una dieta nueva. Las cantidades se calculan con la tabla del documento. Claude puede ayudarte a elegir opciones verificadas solo cuando tú lo solicites.</p><section class="section"><h3>Notas para consultar con tu nutrióloga</h3><p class="muted">Estas notas solo se guardan aquí. No se envían a nadie ni tienen revisión automática.</p>${pendings.length?pendings.map(({date,key,p})=>`<div class="request"><strong>${esc(foods[p.target].name)}</strong><p>${esc(pretty(date))} · ${esc(p.reason)}</p><button data-remove-pending="${esc(key)}" data-pending-date="${date}">Quitar nota</button></div>`).join(''):'<p class="muted">Aquí se guardan tus dudas. No se envían a nadie ni tienen revisión automática.</p>'}</section><section class="section"><h3>Alternativas guardadas</h3>${store.data.alternatives.filter(a=>recipe(a.recipeId)&&foods[a.target]).map(a=>`<p>${esc(recipe(a.recipeId).title)} → ${esc(foods[a.target].name)} <small>Se vuelve a verificar al elegirla desde la receta.</small></p>`).join('')||'<p class="muted">Guarda una alternativa desde la pantalla de cambio. No modifica días futuros.</p>'}</section><section class="section"><h3>Aclaraciones del documento</h3><div class="warning">Líquidos: la página 7 indica 2–2.5 L y la 26 indica 2.5–3 L. La meta permanece sin definir hasta aclararlo con tu nutrióloga.</div><p>En las recetas marcadas, encontrarás diferencias entre ingredientes, preparación o distribución de equivalentes. Cada ingrediente se verifica por separado. Las equivalencias comprobadas se pueden aplicar aunque la receta incluya una aclaración.</p></section><section class="section"><h3>Privacidad y almacenamiento</h3><p class="plan-note">Tu cuenta de administrador de Venus protege el acceso a este plan. Tus registros se guardan solo en este navegador: no se sincronizan con otros dispositivos ni se envían a una IA. No es una cuenta cifrada: otra persona que use este perfil del navegador podría verlos. Borrar los datos del navegador elimina tus registros.</p><button id="clear" class="danger">Borrar mis registros</button></section><section class="section"><h3>Procedencia</h3><p>Páginas del documento: distribución 4; menú 8–10; recetas 11–20; equivalencias 21–25. Los pasos se presentan resumidos. El PDF no se publica en esta app.</p></section>`;
}
function showModal(){if(!dialog.open){returnFocus=document.activeElement;dialog.showModal();}content.querySelector('button')?.focus();}
function restoreFocus(){
 if(returnFocus?.isConnected){returnFocus.focus();return;}
 const replacement=current&&document.querySelector(`[data-recipe="${current.id}"], [data-id="${current.id}"]`);
 (replacement||document.querySelector('nav button.active'))?.focus();
}
function close(){dialog.close();}
dialog.addEventListener('close',restoreFocus);
function openRecipe(id){
 current=recipe(id);if(!current)return;const r=current,list=effective(r),changed=list.some(i=>i.swapped);
 content.innerHTML=`<div class="dialog-top"><div><div class="eyebrow">${slots[r.slot][0]} · ${slots[r.slot][1]}</div><h2 id="dialog-title">${esc(r.title)}</h2></div><button class="close" data-close aria-label="Cerrar">×</button></div><p class="muted">${esc(pretty(day))} · Porción indicada en tu plan</p>${r.warning?`<div class="warning">${esc(r.warning)} Esta aclaración no bloquea los ingredientes con equivalencias comprobadas.</div>`:''}<h3>Ingredientes</h3>${list.map((i,index)=>`<div class="ingredient"><div><strong>${esc(foods[i.foodId]?.name||i.foodId)}</strong><span>${esc(qty(i))}${i.optional?' · Opcional':''}</span>${foods[i.foodId]?.prep==='unknown'?'<small>No se especifica crudo/cocido.</small>':''}${i.swapped?'<small>Cambio confirmado para este día</small>':''}</div><button data-swap="${index}">Cambiar</button></div>`).join('')}${changed?'<div class="warning">La preparación siguiente corresponde a la receta original. Puede requerir adaptación por el cambio de ingrediente; no es una receta nueva validada.</div>':''}<section class="section"><h3>Preparación resumida</h3>${r.steps.length?`<ol class="steps">${r.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:'<p>El documento no incluye pasos de preparación para esta opción.</p>'}</section><details class="source"><summary>Ver procedencia de las cantidades</summary><p>Receta: página ${r.page}. Menú: páginas 8–10.</p>${r.ingredients.map(i=>`<p>${esc(foods[i.foodId].name)}: ${esc(qty(i))}. ${foods[i.foodId].page?'Equivalencia: página '+foods[i.foodId].page+'.':'Sin equivalencia específica.'} Preparación/estado: ${esc(foods[i.foodId].prep)}.</p>`).join('')}</details><div class="actions"><button class="primary" data-done="${r.id}">${store.data.done[day]?.[r.id]?'Desmarcar comida':'Marcar como comido'}</button>${changed?'<button id="restore">Restaurar original</button>':''}</div>`;showModal();
}
function chooseSwap(index){
 if(!current?.ingredients[index])return;
 content.innerHTML='<div class="dialog-top"><h2 id="dialog-title">¿Qué se te antoja?</h2><button data-back>Volver</button></div><p>Cambiar: <strong>'+esc(foods[current.ingredients[index].foodId].name)+'</strong></p><details><summary>Ayúdame con Claude · opcional</summary><label for="ai-question">Describe lo que prefieres</label><textarea id="ai-question" class="search" maxlength="400" placeholder="Quiero una fruta cítrica"></textarea><label class="shopping-row"><input id="ai-consent" type="checkbox"><span>Enviar a Claude el texto que escriba y las opciones verificadas. No se adjuntan historial ni PDF completo. Evita escribir datos personales.</span></label><button class="primary" id="ask-ai" data-index="'+index+'">Buscar opciones con Claude</button><div id="ai-answer" role="status"></div></details><div class="section"><label for="search">Ver equivalencias sin IA</label><input id="search" class="search" placeholder="Por ejemplo: pechuga de pollo" autocomplete="off"><div id="candidates"></div></div>';
 const normalize=s=>s.normalize('NFD').split('').filter(c=>c.charCodeAt(0)<768||c.charCodeAt(0)>879).join('').toLowerCase();
 const search=content.querySelector('#search');const update=()=>{
  const q=normalize(search.value),saved=store.data.alternatives.filter(a=>a.recipeId===current.id&&a.index===index).map(a=>a.target);
  const candidates=Object.values(foods).filter(f=>f.portion&&f.id!==current.ingredients[index].foodId&&normalize(f.name).includes(q)).map(f=>({f,result:proposeSwap(current.ingredients[index],f.id,foods)})).sort((a,b)=>Number(b.result.status==='valid')-Number(a.result.status==='valid')||Number(saved.includes(b.f.id))-Number(saved.includes(a.f.id)));
  content.querySelector('#candidates').innerHTML=candidates.map(({f,result})=>'<button class="candidate" data-target="'+f.id+'" data-index="'+index+'">'+esc(f.name)+(saved.includes(f.id)?' · Guardada':'')+'<small>'+esc(groupNames[f.group]||f.group)+' · '+(result.status==='valid'&&!current.blockSwaps?esc(qty(result)):'Por confirmar')+'</small></button>').join('')||'<p class="empty">No está en el catálogo verificado. No calcularemos una porción inventada.</p>';
 };search.addEventListener('input',update);update();search.focus();
}
async function askClaude(button){
 const answer=content.querySelector('#ai-answer'),question=content.querySelector('#ai-question').value.trim(),consent=content.querySelector('#ai-consent').checked;
 if(!consent||!question){answer.textContent='Escribe tu preferencia y autoriza el envío para consultar a Claude.';return;}
 const index=Number(button.dataset.index),recipeId=current.id;button.disabled=true;answer.textContent='Buscando entre las opciones verificadas…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const r=await fetch('/mi-plan/suggest',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipeId,index,question,consent}),signal:controller.signal});
  if(!r.ok)throw Error(r.status===429?'Espera un momento antes de volver a consultar.':'Claude no está disponible ahora. Puedes usar las equivalencias sin IA.');
  const data=await r.json();if(!answer.isConnected||current.id!==recipeId)return;
  answer.innerHTML='<p>'+esc(data.message)+'</p>'+data.suggestions.map(s=>'<button class="candidate" data-target="'+esc(s.id)+'" data-index="'+index+'">'+esc(s.name)+'<small>'+esc(qty(s))+' · Revisar cambio</small></button>').join('');
 }catch(e){if(answer.isConnected)answer.textContent=e.name==='AbortError'?'La consulta tardó demasiado. Las equivalencias manuales siguen disponibles.':e.message;}
 finally{clearTimeout(timer);if(button.isConnected)button.disabled=false;}
}
function proposal(index,target){
 const original=current.ingredients[index];if(!original||!foods[target])return;
 const calc=proposeSwap(original,target,foods),result=current.blockSwaps?{status:'pending',reason:current.warning}:calc;
 const valid=result.status==='valid';
 content.innerHTML=`<div class="dialog-top"><h2 id="dialog-title">Revisa el cambio</h2><button data-back>Volver</button></div><div class="compare"><div><small>Original</small><strong>${esc(foods[original.foodId].name)}</strong>${esc(qty(original))}</div><div><small>Tu elección</small><strong>${esc(foods[target].name)}</strong>${valid?esc(qty(result)):'Cantidad pendiente de confirmar'}</div></div><div class="${valid?'success':'warning'}">${valid?'Conserva los equivalentes del mismo grupo: '+esc(groupNames[foods[target].group])+'.':esc(result.reason)}</div><p class="source">Tabla: páginas ${foods[original.foodId].page||'sin dato'} y ${foods[target].page}. ${valid?'Solo se cambia este ingrediente; no se añade aceite ni se modifican acompañamientos.':'No se aplicará al menú ni a compras. Puedes guardar una nota para consultarla con tu nutrióloga; no hay revisión automática.'}</p><div class="actions"><button class="primary" data-confirm="${target}" data-index="${index}">${valid?'Confirmar solo para este día':'Guardar duda para mi nutrióloga'}</button>${valid?`<button data-alternative="${target}" data-index="${index}">Guardar como alternativa</button>`:''}</div>`;
}
function confirmSwap(index,target){
 if(!current?.ingredients[index]||!foods[target])return;const result=proposeSwap(current.ingredients[index],target,foods);
 if(result.status==='valid'&&!current.blockSwaps){const d=store.data.changes[day]??={};(d[current.id]??={})[index]=target;delete store.data.pending[day]?.[current.id+':'+index];toast('Cambio confirmado solo para este día.');}
 else{const d=store.data.pending[day]??={};d[current.id+':'+index]={recipeId:current.id,index,target,reason:result.reason};toast('Nota guardada solo aquí; no se envía a nadie. El menú sigue igual.');}
 persist();render();openRecipe(current.id);
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.id==='shop-week'){shoppingDays=new Set(dates());render();return;}
 if(b.id==='shop-clear'){shoppingDays.clear();render();return;}
 if(b.id==='ask-ai'){await askClaude(b);return;}
 if(b.dataset.tab){tab=b.dataset.tab;render();return;}
 if(b.dataset.day){selectDay(b.dataset.day);render();return;}
 if(b.dataset.openDay){selectDay(b.dataset.openDay);openRecipe(b.dataset.id);return;}
 if(b.dataset.recipe){openRecipe(b.dataset.recipe);return;}
 if(b.hasAttribute('data-close')){close();return;}
 if(b.hasAttribute('data-back')){openRecipe(current.id);return;}
 if(b.dataset.done){const d=store.data.done[day]??={};d[b.dataset.done]=!d[b.dataset.done];persist();render();if(dialog.open)openRecipe(b.dataset.done);return;}
 if(b.dataset.swap!==undefined){chooseSwap(Number(b.dataset.swap));return;}
 if(b.dataset.target){proposal(Number(b.dataset.index),b.dataset.target);return;}
 if(b.dataset.confirm){confirmSwap(Number(b.dataset.index),b.dataset.confirm);return;}
 if(b.dataset.alternative){const index=Number(b.dataset.index),target=b.dataset.alternative;if(proposeSwap(current.ingredients[index],target,foods).status==='valid'&&!current.blockSwaps){if(!store.data.alternatives.some(a=>a.recipeId===current.id&&a.index===index&&a.target===target))store.data.alternatives.push({recipeId:current.id,index,target});persist();toast('Alternativa guardada; no cambia el menú.');}return;}
 if(b.dataset.removePending){delete store.data.pending[b.dataset.pendingDate]?.[b.dataset.removePending];persist();render();return;}
 if(b.id==='restore'){delete store.data.changes[day]?.[current.id];persist();render();openRecipe(current.id);toast('Restaurado el menú original.');return;}
 if(b.id==='clear'){if(confirm('¿Borrar todos los registros, cambios y solicitudes de este navegador? El menú original se conserva.')){store.clear();render();}return;}
 if(b.id==='copy-list'){const rows=shoppingList([...shoppingDays].flatMap(d=>menuForDate(d).map(r=>({recipe:r,changes:store.data.changes[d]?.[r.id]||{}}))),foods);const text='Lista de compras · Total para '+shoppingDays.size+' días\n'+rows.filter(r=>store.data.pantry[r.key]!==true).map(r=>`${r.name}: ${qty(r)}${r.optional?' (opcional)':''}`).join('\n');try{await navigator.clipboard.writeText(text);toast('Lista copiada, sin lo que ya tienes.');}catch{const box=document.querySelector('#copy-fallback');box.hidden=false;box.value=text;box.focus();box.select();toast('Selecciona y copia la lista.');}}
});
document.addEventListener('change',e=>{const el=e.target;if(el.id==='date'){if(isDateKey(el.value)){selectDay(el.value);render();}return;}if(el.dataset.shopDay){el.checked?shoppingDays.add(el.dataset.shopDay):shoppingDays.delete(el.dataset.shopDay);render();}if(el.dataset.pantry){store.data.pantry[el.dataset.pantry]=el.checked;persist();}});
async function checkSession(){
 if(document.visibilityState==='hidden')return;
 try{const r=await fetch('/mi-plan/session',{credentials:'same-origin',cache:'no-store'});if(r.status===401||r.status===403){document.body.replaceChildren();location.replace('/mi-plan/entrar');}}catch{/* A transient network failure does not erase local records. */}
}
document.addEventListener('visibilitychange',checkSession);setInterval(checkSession,30000);
render();

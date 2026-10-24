(() => {
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function enhance(select) {
    if (select.dataset.pickerReady) return;
    select.dataset.pickerReady = 'true';
    select.hidden = true;
    select.parentElement.classList.add('pp-product-row');
    const box = document.createElement('div');
    box.className = 'pp-picker';
    const input = document.createElement('input');
    input.type = 'search'; input.placeholder = 'Buscar producto o café';
    input.setAttribute('aria-label', 'Buscar producto o café');
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false');
    input.autocomplete = 'off';
    const panel = document.createElement('div'); panel.className = 'pp-panel'; panel.hidden = true;
    const tabs = document.createElement('div'); tabs.className = 'pp-tabs';
    tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Tipo de artículo');
    const list = document.createElement('div'); list.className = 'pp-list';
    list.id = select.id + '-results'; list.setAttribute('role', 'listbox');
    input.setAttribute('aria-controls', list.id);
    let category = 'all', active = -1;
    const buttons = [];
    for (const [value, label] of [['all','Todos'],['retail','Productos'],['coffee','Café']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.onclick = () => { category = value; render(); };
      tabs.appendChild(button); buttons.push({button,value});
    }
    panel.append(tabs, list); box.append(input, panel); select.after(box);
    const close = () => { panel.hidden = true; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    function render() {
      list.replaceChildren(); active = -1; input.removeAttribute('aria-activedescendant');
      buttons.forEach(({button,value})=>button.setAttribute('aria-pressed',String(value===category)));
      const options = [...select.options].filter(o => o.value && !o.disabled &&
        (category==='all'||o.value.startsWith('coffee:')===(category==='coffee')) && normalize(o.textContent).includes(normalize(input.value)));
      if (!options.length) { const empty=document.createElement('p');empty.textContent='No hay artículos disponibles con esta búsqueda.';list.appendChild(empty); }
      for (const [index, option] of options.entries()) {
        const row = document.createElement('button'); row.type='button'; row.className='pp-option';
        row.setAttribute('role','option');row.setAttribute('aria-selected','false');row.id=list.id+'-'+index;
        const details=document.createElement('span'),name=document.createElement('strong'),group=document.createElement('small'),price=document.createElement('b');
        name.textContent=option.dataset.name||option.dataset.nombre||option.textContent;
        group.textContent=option.parentElement.label||'Productos';
        const amount=Number(option.dataset.price??option.dataset.precio);
        price.textContent=Number.isFinite(amount)?amount.toLocaleString('es-MX',{style:'currency',currency:'MXN'}):'Precio no disponible';
        details.append(name,group);row.append(details,price);
        row.onclick=()=>{select.value=option.value;input.value=name.textContent;close();select.dispatchEvent(new Event('change',{bubbles:true}));input.focus();close();};
        list.appendChild(row);
      }
    }
    const open=()=>{panel.hidden=false;input.setAttribute('aria-expanded','true');render();};
    input.addEventListener('click',()=>{input.select();open();});
    input.addEventListener('input',()=>{select.value='';open();});
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.stopPropagation();close();return;}
      if(!['ArrowDown','ArrowUp','Enter'].includes(event.key))return;
      if(event.key==='Enter'){if(!panel.hidden&&active>=0){event.preventDefault();list.querySelectorAll('.pp-option')[active]?.click();}return;}
      event.preventDefault();if(panel.hidden)open();
      const rows=[...list.querySelectorAll('.pp-option')];if(!rows.length)return;
      active=(active+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length;
      rows.forEach((row,i)=>row.setAttribute('aria-selected',String(i===active)));
      input.setAttribute('aria-activedescendant',rows[active].id);rows[active].scrollIntoView({block:'nearest'});
    });
    box.addEventListener('focusout',()=>setTimeout(()=>{if(!box.contains(document.activeElement))close();},0));
    // Payment forms reset the original select after adding an item.
    new MutationObserver(()=>{if(!select.value)input.value='';if(!panel.hidden)render();}).observe(select,{childList:true,subtree:true});
    box.closest('dialog')?.addEventListener('click',event=>{if(!box.contains(event.target)){close();if(!select.value)input.value='';}});
  }
  function scan(){document.querySelectorAll('#select-producto, #payment-product-select').forEach(enhance);}
  scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
})();

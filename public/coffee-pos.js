// coffee-pos.js — Venus The Coffee Bar POS frontend
(function () {
  'use strict';

  // ==================== STATE ====================
  let products = [];
  let cart = []; // { productId, name, unitPrice, qty, notes, variants }
  let selectedPayment = 'efectivo';
  let activeView = 'pos';
  let currentCategory = 'all';
  let cashSession = null;

  const CATEGORIES = [
    { id: 'all', label: '🔎 Todos' },
    { id: 'bagels', label: '🥯 Bagels' },
    { id: 'cafe', label: '☕ Café' },
    { id: 'te_matcha', label: '🍵 Té y Matcha' },
    { id: 'smoothies', label: '🥤 Smoothies' },
  ];

  // ==================== API HELPERS ====================
  async function api(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
    });
    if (res.status === 401) {
      window.location.href = '/admin-login.html';
      return null;
    }
    return res.json();
  }

  // ==================== INIT ====================
  async function init() {
    await checkAuth();
    renderCategories();
    await loadProducts();
    await loadCashSession();
    bindEvents();
  }

  async function checkAuth() {
    const r = await api('/api/admin/me');
    if (!r || r.error) {
      window.location.href = '/admin-login.html';
      return;
    }
    document.getElementById('cashier-name').textContent = r.email || 'Admin';
  }

  // ==================== PRODUCTS ====================
  async function loadProducts() {
    const r = await api('/api/pos/products');
    if (r?.success) products = r.data;
    renderProducts();
  }

  function renderCategories() {
    const el = document.getElementById('categories');
    el.innerHTML = CATEGORIES.map(c =>
      `<button class="cat-btn${c.id === currentCategory ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>`
    ).join('');
  }

  function renderProducts() {
    const grid = document.getElementById('products-grid');
    const filtered = currentCategory === 'all' ? products : products.filter(p => p.category === currentCategory);
    if (!filtered.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px;">No hay productos en esta categoría</div>';
      return;
    }
    grid.innerHTML = filtered.map(p => `
      <div class="product-card" data-id="${p.id}">
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-price">$${Number(p.price).toFixed(2)}</div>
      </div>
    `).join('');
  }

  // ==================== CART ====================
  function addToCart(productId) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const existing = cart.find(c => c.productId === productId && !c.notes);
    if (existing) {
      existing.qty++;
    } else {
      cart.push({ productId: p.id, name: p.name, unitPrice: Number(p.price), qty: 1, notes: '', variants: null });
    }
    renderCart();
  }

  function renderCart() {
    const el = document.getElementById('cart-items');
    if (!cart.length) {
      el.innerHTML = '<div class="cart-empty">Agrega productos para empezar</div>';
      updateTotals();
      return;
    }
    el.innerHTML = cart.map((item, i) => `
      <div class="cart-item">
        <div class="ci-info">
          <div class="ci-name">${esc(item.name)}</div>
          ${item.notes ? `<div class="ci-notes">${esc(item.notes)}</div>` : ''}
        </div>
        <div class="ci-qty">
          <button onclick="POS.changeQty(${i}, -1)">−</button>
          <span>${item.qty}</span>
          <button onclick="POS.changeQty(${i}, 1)">+</button>
        </div>
        <div class="ci-price">$${(item.unitPrice * item.qty).toFixed(2)}</div>
        <div class="ci-remove" onclick="POS.removeItem(${i})" title="Nota / Eliminar">
          <i class="fas fa-ellipsis-v"></i>
        </div>
      </div>
    `).join('');
    updateTotals();
  }

  function changeQty(index, delta) {
    cart[index].qty += delta;
    if (cart[index].qty < 1) cart.splice(index, 1);
    renderCart();
  }

  function removeItem(index) {
    // If item has no note, offer to add one; otherwise remove
    const item = cart[index];
    if (!item.notes) {
      document.getElementById('note-product-name').textContent = item.name;
      document.getElementById('note-text').value = '';
      document.getElementById('note-text').dataset.index = index;
      openModal('modal-note');
    } else {
      cart.splice(index, 1);
      renderCart();
    }
  }

  function updateTotals() {
    let subtotal = 0;
    for (const item of cart) subtotal += item.unitPrice * item.qty;
    const tax = Math.round(subtotal * 0.16 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    document.getElementById('cart-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('cart-tax').textContent = `$${tax.toFixed(2)}`;
    document.getElementById('cart-discount').textContent = '$0.00';
    document.getElementById('cart-total').textContent = `$${total.toFixed(2)}`;

    const chargeBtn = document.getElementById('charge-btn');
    chargeBtn.textContent = `COBRAR $${total.toFixed(2)}`;
    chargeBtn.disabled = !cart.length;

    updateChange();
  }

  function updateChange() {
    const total = parseTotal();
    const paid = parseFloat(document.getElementById('cash-amount').value) || 0;
    const display = document.getElementById('change-display');
    if (selectedPayment === 'efectivo' && paid > 0 && paid >= total) {
      display.textContent = `Cambio: $${(paid - total).toFixed(2)}`;
    } else {
      display.textContent = '';
    }
  }

  function parseTotal() {
    const text = document.getElementById('cart-total').textContent;
    return parseFloat(text.replace('$', '')) || 0;
  }

  // ==================== CHARGE ====================
  async function charge() {
    if (!cart.length) return;
    const total = parseTotal();
    const amountPaid = selectedPayment === 'efectivo' ? (parseFloat(document.getElementById('cash-amount').value) || total) : total;

    if (selectedPayment === 'efectivo' && amountPaid < total) {
      alert('El monto recibido es menor al total');
      return;
    }

    const body = {
      items: cart.map(c => ({ productId: c.productId, qty: c.qty, unitPrice: c.unitPrice, notes: c.notes, variants: c.variants })),
      paymentMethod: selectedPayment,
      amountPaid,
    };

    const r = await api('/api/pos/sales', { method: 'POST', body: JSON.stringify(body) });
    if (r?.success) {
      showTicket(r.data);
      cart = [];
      renderCart();
      document.getElementById('cash-amount').value = '';
    } else {
      alert(r?.error || 'Error al registrar venta');
    }
  }

  // ==================== TICKET ====================
  function showTicket(sale) {
    const el = document.getElementById('ticket-content');
    const date = new Date(sale.createdAt);
    const items = sale.items.map(i =>
      `<div class="t-item"><div class="t-row"><span>${i.qty}x ${esc(i.productName)}</span><span>$${(Number(i.unitPrice) * i.qty).toFixed(2)}</span></div>${i.notes ? `<div style="font-size:10px;color:#888;margin-left:8px;">${esc(i.notes)}</div>` : ''}</div>`
    ).join('');

    el.innerHTML = `
      <h3>Venus The Coffee Bar</h3>
      <div class="ticket-sub">☕ Gracias por tu compra</div>
      <hr>
      <div class="t-row"><span>Folio:</span><span>${sale.folio}</span></div>
      <div class="t-row"><span>Fecha:</span><span>${date.toLocaleDateString('es-MX')}</span></div>
      <div class="t-row"><span>Hora:</span><span>${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="t-row"><span>Cajero:</span><span>${esc(sale.cashierName)}</span></div>
      <hr>
      <div class="t-items">${items}</div>
      <hr>
      <div class="t-row"><span>Subtotal:</span><span>$${Number(sale.subtotal).toFixed(2)}</span></div>
      <div class="t-row"><span>IVA:</span><span>$${Number(sale.tax).toFixed(2)}</span></div>
      ${Number(sale.discount) > 0 ? `<div class="t-row"><span>Descuento:</span><span>-$${Number(sale.discount).toFixed(2)}</span></div>` : ''}
      <div class="t-row total"><span>Total:</span><span>$${Number(sale.total).toFixed(2)}</span></div>
      <hr>
      <div class="t-row"><span>Método:</span><span>${sale.paymentMethod}</span></div>
      ${sale.amountPaid ? `<div class="t-row"><span>Pagó:</span><span>$${Number(sale.amountPaid).toFixed(2)}</span></div>` : ''}
      ${sale.change > 0 ? `<div class="t-row"><span>Cambio:</span><span>$${Number(sale.change).toFixed(2)}</span></div>` : ''}
      <div class="t-footer">¡Vuelve pronto! ☕</div>
    `;
    document.getElementById('ticket-overlay').classList.add('open');
  }

  window.closeTicket = function () {
    document.getElementById('ticket-overlay').classList.remove('open');
  };

  // ==================== CASH SESSION ====================
  async function loadCashSession() {
    const r = await api('/api/pos/cash/current');
    cashSession = r?.data || null;
    renderCashView();
  }

  function renderCashView() {
    const status = document.getElementById('cash-status');
    const actions = document.getElementById('cash-actions-area');
    const movements = document.getElementById('cash-movements');

    if (!cashSession) {
      status.innerHTML = `<div class="stat-card"><div class="sc-label">Estado</div><div class="sc-value" style="color:var(--danger);">Caja cerrada</div></div>`;
      actions.innerHTML = `<button class="btn-sm" onclick="openModal('modal-cash-open')"><i class="fas fa-lock-open"></i> Abrir Caja</button>`;
      movements.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No hay sesión activa</p>';
      return;
    }

    const opened = new Date(cashSession.openedAt);
    status.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card"><div class="sc-label">Estado</div><div class="sc-value green">Caja abierta</div></div>
        <div class="stat-card"><div class="sc-label">Abierta por</div><div class="sc-value">${esc(cashSession.openedBy)}</div></div>
        <div class="stat-card"><div class="sc-label">Hora apertura</div><div class="sc-value">${opened.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div></div>
        <div class="stat-card"><div class="sc-label">Fondo inicial</div><div class="sc-value gold">$${Number(cashSession.openingAmount).toFixed(2)}</div></div>
      </div>
    `;

    actions.innerHTML = `
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn-sm" onclick="openMovement('income')"><i class="fas fa-arrow-down"></i> Entrada</button>
        <button class="btn-sm" onclick="openMovement('withdrawal')"><i class="fas fa-arrow-up"></i> Retiro</button>
        <button class="btn-sm" style="background:var(--danger);border-color:var(--danger);color:#fff;" onclick="openModal('modal-cash-close')"><i class="fas fa-lock"></i> Cerrar Caja</button>
      </div>
    `;

    if (cashSession.movements?.length) {
      movements.innerHTML = `<table class="data-table"><thead><tr><th>Tipo</th><th>Monto</th><th>Motivo</th><th>Por</th></tr></thead><tbody>
        ${cashSession.movements.map(m => `<tr><td>${m.type === 'income' ? '⬇️ Entrada' : '⬆️ Retiro'}</td><td>$${Number(m.amount).toFixed(2)}</td><td>${esc(m.reason)}</td><td>${esc(m.createdBy)}</td></tr>`).join('')}
      </tbody></table>`;
    } else {
      movements.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Sin movimientos en esta sesión</p>';
    }
  }

  window.openCash = async function () {
    const amount = parseFloat(document.getElementById('cash-open-amount').value);
    if (isNaN(amount) || amount < 0) { alert('Ingresa un monto válido'); return; }
    const r = await api('/api/pos/cash/open', { method: 'POST', body: JSON.stringify({ openingAmount: amount }) });
    if (r?.success) {
      closeModal('modal-cash-open');
      await loadCashSession();
    } else {
      alert(r?.error || 'Error al abrir caja');
    }
  };

  window.closeCash = async function () {
    const amount = parseFloat(document.getElementById('cash-close-amount').value);
    if (isNaN(amount) || amount < 0) { alert('Ingresa el monto contado'); return; }
    const notes = document.getElementById('cash-close-notes').value;
    const r = await api('/api/pos/cash/close', { method: 'POST', body: JSON.stringify({ actualCash: amount, notes }) });
    if (r?.success) {
      closeModal('modal-cash-close');
      const d = r.data;
      alert(`Caja cerrada.\nVentas totales: $${Number(d.totalSales).toFixed(2)}\nEfectivo esperado: $${Number(d.expectedCash).toFixed(2)}\nEfectivo real: $${Number(d.actualCash).toFixed(2)}\nDiferencia: $${Number(d.difference).toFixed(2)}`);
      await loadCashSession();
    } else {
      alert(r?.error || 'Error al cerrar caja');
    }
  };

  window.openMovement = function (type) {
    document.getElementById('movement-type').value = type;
    document.getElementById('movement-title').textContent = type === 'income' ? 'Registrar Entrada' : 'Registrar Retiro';
    document.getElementById('movement-amount').value = '';
    document.getElementById('movement-reason').value = '';
    openModal('modal-cash-movement');
  };

  window.saveMovement = async function () {
    const type = document.getElementById('movement-type').value;
    const amount = parseFloat(document.getElementById('movement-amount').value);
    const reason = document.getElementById('movement-reason').value.trim();
    if (isNaN(amount) || amount <= 0 || !reason) { alert('Ingresa monto y motivo'); return; }
    const r = await api('/api/pos/cash/movement', { method: 'POST', body: JSON.stringify({ type, amount, reason }) });
    if (r?.success) {
      closeModal('modal-cash-movement');
      await loadCashSession();
    } else {
      alert(r?.error || 'Error al registrar movimiento');
    }
  };

  // ==================== REPORTS ====================
  async function loadReport(date) {
    const r = await api(`/api/pos/reports/daily?date=${date}`);
    if (!r?.success) return;
    const d = r.data;

    document.getElementById('report-stats').innerHTML = `
      <div class="stat-card"><div class="sc-label">Ventas</div><div class="sc-value">${d.salesCount}</div></div>
      <div class="stat-card"><div class="sc-label">Total vendido</div><div class="sc-value gold">$${d.totalSales.toFixed(2)}</div></div>
      <div class="stat-card"><div class="sc-label">Ticket promedio</div><div class="sc-value">$${d.averageTicket.toFixed(2)}</div></div>
      <div class="stat-card"><div class="sc-label">IVA</div><div class="sc-value">$${d.totalTax.toFixed(2)}</div></div>
      ${Object.entries(d.byPaymentMethod).map(([m, v]) => `<div class="stat-card"><div class="sc-label">${esc(m)}</div><div class="sc-value green">$${v.toFixed(2)}</div></div>`).join('')}
    `;

    const topBody = document.querySelector('#report-top-table tbody');
    topBody.innerHTML = d.topProducts.map(p => `<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td>$${p.revenue.toFixed(2)}</td></tr>`).join('');

    // Load sales list
    const salesR = await api(`/api/pos/sales?from=${date}&to=${date}`);
    const salesBody = document.querySelector('#report-sales-table tbody');
    if (salesR?.success) {
      salesBody.innerHTML = salesR.data.map(s => {
        const t = new Date(s.createdAt);
        return `<tr><td>${s.folio}</td><td>${t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td><td>${s.paymentMethod}</td><td>$${Number(s.total).toFixed(2)}</td><td>${s.status}</td></tr>`;
      }).join('');
    }
  }

  // ==================== PRODUCTS ADMIN ====================
  async function loadAdminProducts() {
    const r = await api('/api/pos/products?all=true');
    if (!r?.success) return;
    const list = document.getElementById('admin-products-list');
    list.innerHTML = r.data.map(p => `
      <div class="admin-product-row" style="${!p.isActive ? 'opacity:0.5;' : ''}">
        <div class="ap-name">${esc(p.name)}</div>
        <div class="ap-cat">${catLabel(p.category)}</div>
        <div class="ap-price">$${Number(p.price).toFixed(2)}</div>
        <div class="ap-actions">
          <button class="btn-sm" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button>
          ${p.isActive
            ? `<button class="btn-sm" onclick="toggleProduct('${p.id}', false)" title="Desactivar"><i class="fas fa-eye-slash"></i></button>`
            : `<button class="btn-sm" onclick="toggleProduct('${p.id}', true)" title="Activar"><i class="fas fa-eye"></i></button>`
          }
        </div>
      </div>
    `).join('');
  }

  function catLabel(cat) {
    const map = { bagels: '🥯 Bagels', cafe: '☕ Café', te_matcha: '🍵 Té/Matcha', smoothies: '🥤 Smoothies' };
    return map[cat] || cat;
  }

  window.openProductModal = function (product) {
    document.getElementById('product-modal-title').textContent = product ? 'Editar Producto' : 'Nuevo Producto';
    document.getElementById('product-edit-id').value = product?.id || '';
    document.getElementById('product-name').value = product?.name || '';
    document.getElementById('product-category').value = product?.category || 'cafe';
    document.getElementById('product-price').value = product?.price || '';
    openModal('modal-product');
  };

  window.editProduct = async function (id) {
    const p = products.find(x => x.id === id);
    if (!p) {
      const r = await api('/api/pos/products?all=true');
      if (r?.success) {
        const found = r.data.find(x => x.id === id);
        if (found) window.openProductModal(found);
      }
    } else {
      window.openProductModal(p);
    }
  };

  window.saveProduct = async function () {
    const id = document.getElementById('product-edit-id').value;
    const body = {
      name: document.getElementById('product-name').value.trim(),
      category: document.getElementById('product-category').value,
      price: parseFloat(document.getElementById('product-price').value),
    };
    if (!body.name || isNaN(body.price)) { alert('Completa nombre y precio'); return; }

    const url = id ? `/api/pos/products/${id}` : '/api/pos/products';
    const method = id ? 'PUT' : 'POST';
    const r = await api(url, { method, body: JSON.stringify(body) });
    if (r?.success) {
      closeModal('modal-product');
      await loadProducts();
      await loadAdminProducts();
    } else {
      alert(r?.error || 'Error al guardar producto');
    }
  };

  window.toggleProduct = async function (id, active) {
    await api(`/api/pos/products/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: active }) });
    await loadProducts();
    await loadAdminProducts();
  };

  // ==================== NOTES ====================
  window.saveNote = function () {
    const index = parseInt(document.getElementById('note-text').dataset.index);
    const note = document.getElementById('note-text').value.trim();
    if (cart[index]) {
      if (note) {
        cart[index].notes = note;
      } else {
        cart.splice(index, 1);
      }
    }
    closeModal('modal-note');
    renderCart();
  };

  // ==================== EVENTS ====================
  function bindEvents() {
    // Categories
    document.getElementById('categories').addEventListener('click', e => {
      const btn = e.target.closest('.cat-btn');
      if (!btn) return;
      currentCategory = btn.dataset.cat;
      renderCategories();
      renderProducts();
    });

    // Products
    document.getElementById('products-grid').addEventListener('click', e => {
      const card = e.target.closest('.product-card');
      if (!card) return;
      addToCart(card.dataset.id);
    });

    // Payment methods
    document.querySelectorAll('.pay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedPayment = btn.dataset.method;
        const cashRow = document.getElementById('cash-input-row');
        cashRow.style.display = selectedPayment === 'efectivo' ? 'flex' : 'none';
        updateChange();
      });
    });

    // Cash amount input
    document.getElementById('cash-amount').addEventListener('input', updateChange);

    // Charge button
    document.getElementById('charge-btn').addEventListener('click', charge);

    // View tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.pos-view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-' + view).classList.add('active');
        activeView = view;
        if (view === 'cash') loadCashSession();
        if (view === 'reports') {
          const today = new Date().toISOString().slice(0, 10);
          document.getElementById('report-date').value = today;
          loadReport(today);
        }
        if (view === 'products-admin') loadAdminProducts();
      });
    });

    // Report date change
    document.getElementById('report-date').addEventListener('change', e => loadReport(e.target.value));
  }

  // ==================== MODALS ====================
  window.openModal = function (id) { document.getElementById(id).classList.add('open'); };
  window.closeModal = function (id) { document.getElementById(id).classList.remove('open'); };

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
  });

  // ==================== LOGOUT ====================
  window.logout = function () {
    window.location.href = '/admin.html';
  };

  // ==================== UTILS ====================
  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ==================== EXPOSE ====================
  window.POS = { changeQty, removeItem };

  // ==================== START ====================
  document.addEventListener('DOMContentLoaded', init);
})();

(() => {
  const root = document.getElementById('tab-reports');
  if (!root || root.dataset.layoutReady) return;
  root.dataset.layoutReady = 'true';
  const metrics = document.createElement('div');
  metrics.className = 'sales-headline-metrics';
  metrics.setAttribute('aria-label', 'Resumen del periodo');
  for (const [label, id, tone] of [
    ['Ventas', 'report-total-ingresos', ''],
    ['Gastos', 'report-total-egresos', 'expense'],
    ['Utilidad', 'report-utilidad', 'profit'],
    ['Cobros', 'report-sales-count', ''],
  ]) {
    const item = document.createElement('div'); item.className = 'sales-headline-metric ' + tone;
    const title = document.createElement('span'); title.textContent = label;
    item.append(title, document.getElementById(id)); metrics.append(item);
  }
  root.querySelector('.report-filter-card').after(metrics);
  const overview = root.querySelector('.sales-overview');
  const financial = root.querySelector('.sales-financial');
  const details = document.createElement('details'); details.className = 'sales-breakdown';
  const summary = document.createElement('summary'); summary.textContent = 'Desglose por pago y servicios';
  details.append(summary, root.querySelector('.sales-metrics'), financial); root.append(details);
  // Retain canvases and IDs so the existing chart lifecycle stays unchanged.
  overview.append(root.querySelector('.sales-service-chart'));
  financial.children[2].hidden = true;
  const period = document.getElementById('report-current-month'); period.classList.add('sales-period');
  root.querySelector('.header-actions h2').after(period);
  const ledger = root.querySelector('.sales-ledger'); ledger.querySelector('h3').textContent = 'Movimientos';
  const toggle = document.createElement('button'); toggle.className = 'btn ghost small'; toggle.type = 'button';
  toggle.textContent = 'Detalle fiscal'; toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => { const expanded = ledger.classList.toggle('sales-fiscal-visible'); toggle.setAttribute('aria-pressed', String(expanded)); });
  ledger.querySelector('.report-sales-head').append(toggle);
})();

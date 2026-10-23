(() => {
  'use strict';
  // Explicit form inventory: scanners, client records, signatures and image viewers stay untouched.
  const selector = [
    '#newApptDialog', '#editApptDialog', '#packageDialog', '#sellPackageDialog',
    '#creditDialog', '#blocksDialog', '#paymentDialog', '#manualIncomeDialog',
    '#expenseDialog', '#directSaleDialog', '#newSessionDialog', '#editarIngresoDialog',
    '#modal-product .modal-card', '#modal-service .modal-card',
    '#modal-cobrar-cita .cobro-modal', '#reschedule-dialog', '#receivable-dialog', '.ci-dialog',
    '#card-modal-backdrop .cmx-card', '#venus-dialog-root .vd-card'
  ].join(',');
  function decorate(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(selector)) root.classList.add('admin-form-surface');
    root.querySelectorAll(selector).forEach(el => el.classList.add('admin-form-surface'));
  }
  decorate(document.documentElement);
  // These editors were inside the page stacking context, behind the toolbar/FAB.
  document.querySelectorAll('#modal-product, #modal-service, #card-modal-backdrop, #modal-giftcard-view').forEach(overlay => {
    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
  });
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) decorate(node);
  }).observe(document.body, { childList: true, subtree: true });
})();

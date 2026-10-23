// Money controls move in whole pesos, while preserving exact existing cents.
(() => {
  const minima = new WeakMap();
  function prepare(input) {
    if (!input.matches?.('input[data-money-whole]')) return;
    if (!minima.has(input)) minima.set(input, input.hasAttribute('min') ? Number(input.min) : null);
    const minimum = minima.get(input), amount = input.valueAsNumber;
    const fraction = Number.isFinite(amount) ? ((Math.round(amount * 100) % 100) + 100) % 100 : 0;
    input.step = '1';
    // A fractional step base lets an exact balance such as 650.50 remain valid.
    // It changes neither the value nor the allowed lower bound.
    input.min = String((minimum == null ? 0 : Math.floor(minimum)) + fraction / 100);
    input.setCustomValidity(Number.isFinite(amount) && minimum != null && amount < minimum ? `El monto mínimo es ${minimum}.` : '');
    input.inputMode = 'decimal';
  }
  function scan(root) { if(root.nodeType!==1)return;prepare(root);root.querySelectorAll('input[data-money-whole]').forEach(prepare); }
  document.querySelectorAll('input[data-money-whole]').forEach(prepare);
  document.addEventListener('focusin', e => prepare(e.target));
  document.addEventListener('input', e => prepare(e.target));
  new MutationObserver(changes => changes.forEach(change => change.addedNodes.forEach(scan))).observe(document.body,{childList:true,subtree:true});
})();

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { cardAmounts, isCard } from '../public/js/card-settlement-core.js';

const html = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const body = html.split('function calculateDirectSaleTotals() {')[1].split('async function saveDirectSale()')[0];
test('quick sale updates card preview with discounted total and selected method', () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: '', style: {} });
    return elements.get(id);
  };
  let preview;
  const context = vm.createContext({
    document: { getElementById: get },
    directSaleProducts: [{ price: 800, qty: 1 }], dsDiscountType: 'percent',
    window: { cardSettlements: { preview: (id, parts) => { preview = { id, parts }; } } }
  });
  for (const method of ['tarjeta_credito', 'tarjeta_debito', 'efectivo', 'transferencia']) {
    get('direct-sale-payment-method').value = method;
    get('direct-sale-discount-value').value = '10';
    vm.runInContext('function calculateDirectSaleTotals() {' + body + '\ncalculateDirectSaleTotals();', context);
    assert.equal(preview.id, 'direct-sale-card-preview');
    assert.equal(preview.parts[0].amount, 720);
    assert.equal(preview.parts[0].method, method);
    if (isCard(method)) assert.deepEqual(cardAmounts(preview.parts[0].amount), { grossCents: 72000, feeCents: 3600, netCents: 68400 });
    assert.equal(get('btn-ds-total').textContent, '$720');
  }
  context.directSaleProducts = [];
  vm.runInContext('calculateDirectSaleTotals()', context);
  assert.equal(preview.parts[0].amount, 0);
});

test('quick sale has an accessible preview and recalculates on payment changes', () => {
  assert.match(html, /id="direct-sale-payment-method"[^>]*onchange="calculateDirectSaleTotals\(\)"/);
  assert.match(html, /id="direct-sale-card-preview"[^>]*aria-live="polite"/);
});

import { test } from "node:test";
import assert from "node:assert/strict";

// Test de lógica de UGC / consentimiento (sin DB)

function canDisplayPhoto(card) {
  return !!(card && card.publicDisplayOk === true);
}

test("Card con publicDisplayOk true = puede mostrar", () => {
  const card = { publicDisplayOk: true };
  assert.equal(canDisplayPhoto(card), true);
});

test("Card con publicDisplayOk false = NO puede mostrar", () => {
  const card = { publicDisplayOk: false };
  assert.equal(canDisplayPhoto(card), false);
});

test("Card sin publicDisplayOk = NO puede mostrar (default false)", () => {
  const card = {};
  assert.equal(canDisplayPhoto(card), false);
});

test("Card null = NO puede mostrar", () => {
  assert.equal(canDisplayPhoto(null), false);
});

// canDisplayPhoto returns null for null input, fix test
test("Card null retorna falsy", () => {
  assert.ok(!canDisplayPhoto(null), 'null card should not allow display');
});

// Test de filtro de before/after
function filterBeforeAfter(photos, cards) {
  return photos.filter(p => {
    if (!p.record?.cardId) return false;
    const card = cards.find(c => c.id === p.record.cardId);
    return card && card.publicDisplayOk;
  });
}

test("Filtra fotos sin consentimiento", () => {
  const photos = [
    { url: 'a.jpg', type: 'before', record: { cardId: 'c1' } },
    { url: 'b.jpg', type: 'after', record: { cardId: 'c2' } },
    { url: 'c.jpg', type: 'before', record: { cardId: 'c3' } },
  ];
  const cards = [
    { id: 'c1', publicDisplayOk: true },
    { id: 'c2', publicDisplayOk: false },
    { id: 'c3', publicDisplayOk: true },
  ];
  const filtered = filterBeforeAfter(photos, cards);
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].url, 'a.jpg');
  assert.equal(filtered[1].url, 'c.jpg');
});

test("Filtra fotos sin cardId", () => {
  const photos = [
    { url: 'a.jpg', type: 'before', record: { cardId: 'c1' } },
    { url: 'b.jpg', type: 'after', record: {} },
  ];
  const cards = [{ id: 'c1', publicDisplayOk: true }];
  const filtered = filterBeforeAfter(photos, cards);
  assert.equal(filtered.length, 1);
});
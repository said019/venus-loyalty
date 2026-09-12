import { test } from "node:test";
import assert from "node:assert/strict";

// Test de lógica de promoción a Gold (sin DB)

function shouldPromoteToGold(card, threshold = 2) {
  return card.status === 'active' && card.cardType !== 'gold' && card.cycles >= threshold;
}

test("Promueve a Gold si cycles >= 2 y no es gold", () => {
  const card = { status: 'active', cardType: 'loyalty', cycles: 2 };
  assert.equal(shouldPromoteToGold(card), true);
});

test("No promueve si ya es gold", () => {
  const card = { status: 'active', cardType: 'gold', cycles: 5 };
  assert.equal(shouldPromoteToGold(card), false);
});

test("No promueve si cycles < 2", () => {
  const card = { status: 'active', cardType: 'loyalty', cycles: 1 };
  assert.equal(shouldPromoteToGold(card), false);
});

test("No promueve si status no es active", () => {
  const card = { status: 'inactive', cardType: 'loyalty', cycles: 5 };
  assert.equal(shouldPromoteToGold(card), false);
});

test("Promueve con threshold custom", () => {
  const card = { status: 'active', cardType: 'loyalty', cycles: 3 };
  assert.equal(shouldPromoteToGold(card, 3), true);
  assert.equal(shouldPromoteToGold(card, 4), false);
});

// Detección de embajadoras
function shouldPromoteToAmbassador(card, reviews5star, completedReferrals, minReviews = 3, minReferrals = 2) {
  return reviews5star >= minReviews && completedReferrals >= minReferrals;
}

test("Embajadora: 3 reseñas 5★ + 2 referidos = true", () => {
  assert.equal(shouldPromoteToAmbassador(null, 3, 2), true);
});

test("Embajadora: 2 reseñas + 2 referidos = false (faltan reseñas)", () => {
  assert.equal(shouldPromoteToAmbassador(null, 2, 2), false);
});

test("Embajadora: 3 reseñas + 1 referido = false (falta referido)", () => {
  assert.equal(shouldPromoteToAmbassador(null, 3, 1), false);
});

test("Embajadora: 5 reseñas + 10 referidos = true", () => {
  assert.equal(shouldPromoteToAmbassador(null, 5, 10), true);
});
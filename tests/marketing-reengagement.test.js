import { test } from "node:test";
import assert from "node:assert/strict";

// Test de lógica de re-engagement (sin DB)

function getDaysSinceLastVisit(lastVisit, now = new Date()) {
  if (!lastVisit) return Infinity;
  return Math.floor((now - new Date(lastVisit)) / (1000 * 60 * 60 * 24));
}

function shouldSendReengagement(card, days, recentNotifCutoff) {
  if (card.status !== 'active') return false;
  if (!card.lastVisit) return false;
  const daysSince = getDaysSinceLastVisit(card.lastVisit);
  // Enviar solo si cruzó exactamente el threshold (no reenviar si ya pasó)
  return daysSince >= days && daysSince < days + 1;
}

test("getDaysSinceLastVisit: 30 días atrás = 30", () => {
  const lastVisit = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  assert.equal(getDaysSinceLastVisit(lastVisit), 30);
});

test("getDaysSinceLastVisit: null = Infinity", () => {
  assert.equal(getDaysSinceLastVisit(null), Infinity);
});

test("shouldSendReengagement: 30 días exactos = true", () => {
  const lastVisit = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const card = { status: 'active', lastVisit };
  assert.equal(shouldSendReengagement(card, 30), true);
});

test("shouldSendReengagement: 31 días = false para threshold 30 (ya pasó)", () => {
  const lastVisit = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const card = { status: 'active', lastVisit };
  assert.equal(shouldSendReengagement(card, 30), false);
});

test("shouldSendReengagement: 60 días = true para threshold 60", () => {
  const lastVisit = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const card = { status: 'active', lastVisit };
  assert.equal(shouldSendReengagement(card, 60), true);
});

test("shouldSendReengagement: inactive card = false", () => {
  const lastVisit = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const card = { status: 'inactive', lastVisit };
  assert.equal(shouldSendReengagement(card, 30), false);
});

test("shouldSendReengagement: null lastVisit = false", () => {
  const card = { status: 'active', lastVisit: null };
  assert.equal(shouldSendReengagement(card, 30), false);
});
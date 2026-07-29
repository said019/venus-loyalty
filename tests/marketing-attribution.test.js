import { test } from "node:test";
import assert from "node:assert/strict";

// Test de lógica de atribución multi-touch (sin DB)

function buildAttributionReport(touchpoints) {
  // Agrupar por cardId
  const byCard = {};
  for (const tp of touchpoints) {
    if (!tp.cardId) continue;
    if (!byCard[tp.cardId]) byCard[tp.cardId] = [];
    byCard[tp.cardId].push(tp);
  }

  const firstTouch = {};
  const lastTouch = {};
  for (const [cardId, tps] of Object.entries(byCard)) {
    firstTouch[cardId] = tps[0].channel;
    lastTouch[cardId] = tps[tps.length - 1].channel;
  }

  const firstCounts = {};
  const lastCounts = {};
  for (const ch of Object.values(firstTouch)) {
    firstCounts[ch] = (firstCounts[ch] || 0) + 1;
  }
  for (const ch of Object.values(lastTouch)) {
    lastCounts[ch] = (lastCounts[ch] || 0) + 1;
  }

  return { firstTouch: firstCounts, lastTouch: lastCounts, totalCards: Object.keys(byCard).length };
}

test("Reporte vacío = 0 cards", () => {
  const report = buildAttributionReport([]);
  assert.equal(report.totalCards, 0);
});

test("1 card con 1 touch = first y last son el mismo canal", () => {
  const report = buildAttributionReport([
    { cardId: 'c1', channel: 'instagram' },
  ]);
  assert.equal(report.firstTouch.instagram, 1);
  assert.equal(report.lastTouch.instagram, 1);
  assert.equal(report.totalCards, 1);
});

test("1 card con 2 touchpoints (instagram → referral) = first instagram, last referral", () => {
  const report = buildAttributionReport([
    { cardId: 'c1', channel: 'instagram' },
    { cardId: 'c1', channel: 'referral' },
  ]);
  assert.equal(report.firstTouch.instagram, 1);
  assert.equal(report.lastTouch.referral, 1);
});

test("2 cards, diferentes canales en first-touch", () => {
  const report = buildAttributionReport([
    { cardId: 'c1', channel: 'instagram' },
    { cardId: 'c1', channel: 'referral' },
    { cardId: 'c2', channel: 'facebook-ads' },
  ]);
  assert.equal(report.firstTouch.instagram, 1);
  assert.equal(report.firstTouch['facebook-ads'], 1);
  assert.equal(report.lastTouch.referral, 1);
  assert.equal(report.lastTouch['facebook-ads'], 1);
  assert.equal(report.totalCards, 2);
});

test("Touchpoints sin cardId se ignoran", () => {
  const report = buildAttributionReport([
    { cardId: null, channel: 'instagram' },
    { cardId: 'c1', channel: 'referral' },
  ]);
  assert.equal(report.totalCards, 1);
  assert.equal(report.firstTouch.referral, 1);
});
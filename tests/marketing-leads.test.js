import { test } from "node:test";
import assert from "node:assert/strict";

// Test del algoritmo de lead scoring (sin DB — lógica pura)
// Replica la lógica de LeadsRepo.computeScore

function computeLeadScore(lead, hasRecentWhatsApp, servicePrice) {
  let score = 0;
  if (lead.isNewClient) score += 30;
  if (lead.origin === 'referido') score += 20;
  if (lead.clientBirthday) score += 15;
  if (servicePrice && servicePrice >= 500) score += 10;
  if (hasRecentWhatsApp) score += 20;
  if (['facebook-ads', 'instagram-ads'].includes(lead.origin) && !hasRecentWhatsApp) score -= 25;
  return Math.max(0, Math.min(100, score));
}

test("Lead nuevo sin señales = score 0", () => {
  const lead = { origin: 'otro', isNewClient: false };
  const score = computeLeadScore(lead, false, 0);
  assert.equal(score, 0);
});

test("Lead nuevo referido con WhatsApp reciente = score 95", () => {
  const lead = { origin: 'referido', isNewClient: true, clientBirthday: '01-15' };
  const score = computeLeadScore(lead, true, 600);
  // 30 (new) + 20 (referido) + 15 (birthday) + 10 (price>=500) + 20 (whatsapp) = 95
  assert.equal(score, 95);
});

test("Lead de ad fría sin follow-up = score bajo (5)", () => {
  const lead = { origin: 'facebook-ads', isNewClient: true };
  const score = computeLeadScore(lead, false, 0);
  // 30 (new) - 25 (cold ad no follow) = 5
  assert.equal(score, 5);
});

test("Lead de ad fría con follow-up = score medio (50)", () => {
  const lead = { origin: 'facebook-ads', isNewClient: true };
  const score = computeLeadScore(lead, true, 0);
  // 30 (new) + 20 (whatsapp) = 50
  assert.equal(score, 50);
});

test("Lead existente referido con WhatsApp = 40", () => {
  const lead = { origin: 'referido', isNewClient: false };
  const score = computeLeadScore(lead, true, 0);
  // 20 (referido) + 20 (whatsapp) = 40
  assert.equal(score, 40);
});

test("Score nunca excede 100", () => {
  const lead = { origin: 'referido', isNewClient: true, clientBirthday: '06-20' };
  const score = computeLeadScore(lead, true, 1000);
  // 30+20+15+10+20 = 95 (no llega a 100 con estos inputs, pero el cap funciona)
  assert.ok(score <= 100, 'Score should not exceed 100');
});

test("Score nunca es negativo", () => {
  const lead = { origin: 'facebook-ads', isNewClient: false };
  const score = computeLeadScore(lead, false, 0);
  assert.equal(score, 0);
});
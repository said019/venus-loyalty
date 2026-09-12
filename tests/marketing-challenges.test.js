import { test } from "node:test";
import assert from "node:assert/strict";

// Test de lógica de retos/challenges (sin DB)

function isChallengeComplete(challenge) {
  return challenge.visitsCompleted >= challenge.targetVisits;
}

function isChallengeExpired(challenge, now = new Date()) {
  const deadline = new Date(challenge.startedAt.getTime() + challenge.windowDays * 24 * 60 * 60 * 1000);
  return deadline < now && challenge.visitsCompleted < challenge.targetVisits;
}

test("Reto completo cuando visitsCompleted >= targetVisits", () => {
  const ch = { visitsCompleted: 3, targetVisits: 3 };
  assert.equal(isChallengeComplete(ch), true);
});

test("Reto incompleto cuando visitsCompleted < targetVisits", () => {
  const ch = { visitsCompleted: 2, targetVisits: 3 };
  assert.equal(isChallengeComplete(ch), false);
});

test("Reto expirado si pasó la ventana y no completó", () => {
  const startedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 días atrás
  const ch = { startedAt, windowDays: 30, visitsCompleted: 2, targetVisits: 3 };
  assert.equal(isChallengeExpired(ch), true);
});

test("Reto no expirado si está dentro de la ventana", () => {
  const startedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 días atrás
  const ch = { startedAt, windowDays: 30, visitsCompleted: 1, targetVisits: 3 };
  assert.equal(isChallengeExpired(ch), false);
});

test("Reto no expirado si completó aunque pase la ventana", () => {
  const startedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 días atrás
  const ch = { startedAt, windowDays: 30, visitsCompleted: 3, targetVisits: 3 };
  assert.equal(isChallengeExpired(ch), false);
});
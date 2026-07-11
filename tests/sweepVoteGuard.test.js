// tests/sweepVoteGuard.test.js
// Run: node --test tests/sweepVoteGuard.test.js
//
// Guard del barrido de votos (reconcilePollVotes). Incidentes que lo moldean:
//  - Stephanie (2 jul 2026): voto viejo re-aplicado en loop cada 3 min.
//    → un voto ANTERIOR al último cambio de la cita jamás se aplica.
//  - Mariel (11 jul 2026): votó "Reagendar" sobre cita confirmada y el barrido
//    la ignoró en silencio (ni acuse ni aviso al panel).
//    → confirmed puede pasar a rescheduling/cancelled si el voto es POSTERIOR
//      a la confirmación.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldApplySweepVote } from '../src/services/pollVotes.js';

const T0 = Date.parse('2026-07-11T14:00:00-06:00'); // confirmación / último cambio
const ANTES = T0 - 60 * 60 * 1000;
const DESPUES = T0 + 5 * 60 * 1000;

test('scheduled: se aplica (comportamiento actual del barrido)', () => {
    assert.equal(shouldApplySweepVote({ status: 'scheduled', target: 'confirmed', voteTsMs: null, confirmedAtMs: null, updatedAtMs: T0 }), true);
    assert.equal(shouldApplySweepVote({ status: 'scheduled', target: 'rescheduling', voteTsMs: DESPUES, confirmedAtMs: null, updatedAtMs: T0 }), true);
});

test('Mariel: confirmed + voto Reagendar POSTERIOR a la confirmación → se aplica', () => {
    assert.equal(shouldApplySweepVote({ status: 'confirmed', target: 'rescheduling', voteTsMs: DESPUES, confirmedAtMs: T0, updatedAtMs: T0 }), true);
    assert.equal(shouldApplySweepVote({ status: 'confirmed', target: 'cancelled', voteTsMs: DESPUES, confirmedAtMs: T0, updatedAtMs: T0 }), true);
});

test('Stephanie: voto viejo (ANTERIOR al último cambio) sobre confirmada → NO se aplica', () => {
    assert.equal(shouldApplySweepVote({ status: 'confirmed', target: 'rescheduling', voteTsMs: ANTES, confirmedAtMs: T0, updatedAtMs: T0 }), false);
});

test('confirmed sin timestamp del voto → NO se aplica (no hay forma segura de ordenar)', () => {
    assert.equal(shouldApplySweepVote({ status: 'confirmed', target: 'rescheduling', voteTsMs: null, confirmedAtMs: T0, updatedAtMs: T0 }), false);
});

test('mismo estado destino → NO re-aplicar (sin re-acuses)', () => {
    assert.equal(shouldApplySweepVote({ status: 'confirmed', target: 'confirmed', voteTsMs: DESPUES, confirmedAtMs: T0, updatedAtMs: T0 }), false);
});

test('cancelled y rescheduling son terminales para el barrido', () => {
    assert.equal(shouldApplySweepVote({ status: 'cancelled', target: 'confirmed', voteTsMs: DESPUES, confirmedAtMs: null, updatedAtMs: T0 }), false);
    assert.equal(shouldApplySweepVote({ status: 'rescheduling', target: 'confirmed', voteTsMs: DESPUES, confirmedAtMs: null, updatedAtMs: T0 }), false);
});

test('confirmed sin confirmedAt usa updatedAt como ancla', () => {
    assert.equal(shouldApplySweepVote({ status: 'confirmed', target: 'rescheduling', voteTsMs: DESPUES, confirmedAtMs: null, updatedAtMs: T0 }), true);
    assert.equal(shouldApplySweepVote({ status: 'confirmed', target: 'rescheduling', voteTsMs: ANTES, confirmedAtMs: null, updatedAtMs: T0 }), false);
});

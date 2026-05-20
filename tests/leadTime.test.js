// tests/leadTime.test.js
// Run: node --test tests/leadTime.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLeadTime, LEAD_TIME_RULE } from '../src/utils/leadTime.js';

// Helper: construye un Date desde "YYYY-MM-DD HH:MM" interpretado como hora MX (-06:00)
const mx = (s) => new Date(s.replace(' ', 'T') + ':00-06:00');

test('slot futuro (día siguiente) no aplica lead time', () => {
    const r = validateLeadTime({
        date: '2026-05-21', time: '09:00',
        now: mx('2026-05-20 23:30'),
    });
    assert.equal(r.ok, true);
    assert.equal(r.branch, 'future');
});

test('rama día — 1h exacta inclusivo: OK', () => {
    const r = validateLeadTime({
        date: '2026-05-20', time: '17:00',
        now: mx('2026-05-20 16:00'),
    });
    assert.equal(r.ok, true);
    assert.equal(r.branch, 'day');
});

test('rama día — 59 min: rechazado', () => {
    const r = validateLeadTime({
        date: '2026-05-20', time: '17:00',
        now: mx('2026-05-20 16:01'),
    });
    assert.equal(r.ok, false);
    assert.equal(r.branch, 'day');
    assert.match(r.reason, /1 hora/);
});

test('rama tarde — 8h exactas inclusivo: OK', () => {
    const r = validateLeadTime({
        date: '2026-05-20', time: '18:00',
        now: mx('2026-05-20 10:00'),
    });
    assert.equal(r.ok, true);
    assert.equal(r.branch, 'evening');
});

test('rama tarde — 7h 59min: rechazado', () => {
    const r = validateLeadTime({
        date: '2026-05-20', time: '18:00',
        now: mx('2026-05-20 10:01'),
    });
    assert.equal(r.ok, false);
    assert.equal(r.branch, 'evening');
    assert.match(r.reason, /6:00 PM/);
});

test('slot a las 19:00 con 3h sólo (rechazado, rama tarde)', () => {
    const r = validateLeadTime({
        date: '2026-05-20', time: '19:00',
        now: mx('2026-05-20 16:00'),
    });
    assert.equal(r.ok, false);
    assert.equal(r.branch, 'evening');
});

test('formato inválido devuelve error', () => {
    const r = validateLeadTime({ date: '20/05/2026', time: '17:00' });
    assert.equal(r.ok, false);
    assert.equal(r.branch, 'past_or_invalid');
});

test('servidor en UTC: caso de 8h exactas sigue OK', () => {
    // Simula que process.TZ es UTC (como Render). El slot 18:00 MX
    // = 00:00 UTC del siguiente día. now = 10:00 MX = 16:00 UTC mismo día.
    // diff = 8h en cualquier reloj. Función no depende de process.TZ.
    const originalTZ = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
        const r = validateLeadTime({
            date: '2026-05-20', time: '18:00',
            now: new Date('2026-05-20T16:00:00.000Z'), // 10am MX
        });
        assert.equal(r.ok, true);
        assert.equal(r.branch, 'evening');
    } finally {
        process.env.TZ = originalTZ;
    }
});

test('constantes expuestas son las esperadas', () => {
    assert.equal(LEAD_TIME_RULE.eveningCutoffHour, 18);
    assert.equal(LEAD_TIME_RULE.eveningMinHours, 8);
    assert.equal(LEAD_TIME_RULE.dayMinHours, 1);
});

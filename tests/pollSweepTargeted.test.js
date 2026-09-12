// tests/pollSweepTargeted.test.js
// Run: node --test tests/pollSweepTargeted.test.js
//
// Barrido DIRIGIDO de votos (incidente Thania 18-jul-2026): la clienta votó
// "Confirmar asistencia" a las 9AM y el barrido global nunca vio el voto (el
// store lo comparte una instancia que también manda campañas masivas y la
// ventana de 300 mensajes lo enterró). El barrido dirigido consulta el CHAT de
// cada clienta con encuesta activa, así que el voto no se puede enterrar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneToJid, mergeVoteRecords, jidCandidates } from '../src/services/pollVotes.js';

test('phoneToJid normaliza a formato 52XXXXXXXXXX@s.whatsapp.net', () => {
    assert.equal(phoneToJid('4271234567'), '524271234567@s.whatsapp.net');
    assert.equal(phoneToJid('524271234567'), '524271234567@s.whatsapp.net');
    assert.equal(phoneToJid('5214271234567'), '524271234567@s.whatsapp.net'); // 521 legacy
    assert.equal(phoneToJid('427-123-4567'), '524271234567@s.whatsapp.net');
});

test('jidCandidates prueba 521 (forma real del store MX) antes que 52', () => {
    assert.deepEqual(jidCandidates('4271908849'), [
        '5214271908849@s.whatsapp.net',
        '524271908849@s.whatsapp.net',
    ]);
    assert.deepEqual(jidCandidates('5214271908849'), [
        '5214271908849@s.whatsapp.net',
        '524271908849@s.whatsapp.net',
    ]);
    // Número no-MX: un solo candidato, sin inventar prefijos
    assert.deepEqual(jidCandidates('15551234567'), ['15551234567@s.whatsapp.net']);
});

test('mergeVoteRecords deduplica por key.id conservando el primero', () => {
    const a = { key: { id: 'MSG1' }, message: { pollUpdateMessage: { x: 1 } } };
    const aDup = { key: { id: 'MSG1' }, message: { pollUpdateMessage: { x: 99 } } };
    const b = { key: { id: 'MSG2' }, message: { pollUpdateMessage: {} } };
    const out = mergeVoteRecords([a, b], [aDup]);
    assert.equal(out.length, 2);
    assert.equal(out.find(r => r.key.id === 'MSG1').message.pollUpdateMessage.x, 1);
});

test('mergeVoteRecords ignora registros sin pollUpdateMessage y sin key.id no duplica de más', () => {
    const voto = { key: { id: 'V1' }, message: { pollUpdateMessage: {} } };
    const texto = { key: { id: 'T1' }, message: { conversation: 'hola' } };
    const sinId = { key: {}, message: { pollUpdateMessage: {} } };
    const sinId2 = { key: {}, message: { pollUpdateMessage: {} } };
    const out = mergeVoteRecords([voto, texto], [sinId, sinId2]);
    // el texto se descarta; los sin id se conservan ambos (no hay forma de dedupear)
    assert.equal(out.length, 3);
    assert.ok(out.every(r => r.message?.pollUpdateMessage));
});

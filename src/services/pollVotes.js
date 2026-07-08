// src/services/pollVotes.js
// Decodificación y reconciliación de votos de encuestas (Evolution API / Baileys).
//
// CONTEXTO (verificado en prod, jun-2026):
//  - Evolution descifra el voto y lo guarda con la opción en TEXTO PLANO en
//    `pollUpdateMessage.vote.selectedOptions = ["Confirmar asistencia"]`
//    (NO es un hash; el código viejo asumía hash y nunca matcheaba).
//  - El JID entrante usa el nuevo direccionamiento `@lid`; el teléfono real
//    viene en `key.remoteJidAlt` (ej. "5214271908849@s.whatsapp.net").
//  - Evolution NO empuja el voto al webhook de forma confiable (solo manda
//    recibos de estado READ/DELIVERY_ACK), pero SÍ lo guarda en su store.
//    Por eso la vía confiable es barrer el store periódicamente (cron).
import crypto from 'crypto';
import { prisma } from '../db/index.js';
import { getEvolutionClient } from './whatsapp-evolution.js';

export const STANDARD_POLL_OPTIONS = ['Confirmar asistencia', 'Reagendar', 'Cancelar'];

const sha256Hex = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex').toLowerCase();

// Normaliza un posible hash de voto (Buffer/hex/base64) a hex lowercase, o null.
function normalizeHash(raw) {
    if (!raw) return null;
    const v = raw?.buffer !== undefined ? raw.buffer : raw;
    if (Array.isArray(v?.data)) return Buffer.from(v.data).toString('hex').toLowerCase();
    if (v instanceof Uint8Array || Buffer.isBuffer(v)) return Buffer.from(v).toString('hex').toLowerCase();
    if (typeof v !== 'string') return null;
    const s = v.trim();
    if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
    try { const b = Buffer.from(s, 'base64'); if (b.length === 32) return b.toString('hex').toLowerCase(); } catch { /* noop */ }
    return null;
}

// Devuelve el nombre de la opción votada. PRIMERO intenta texto plano (formato
// actual de Evolution), luego cae a match por hash SHA-256 (formato legacy).
export function decodeSelectedOption(selectedOptions, knownOptions = STANDARD_POLL_OPTIONS) {
    if (Array.isArray(selectedOptions) && selectedOptions.length) {
        for (const raw of selectedOptions) {
            if (typeof raw === 'string') {
                const t = raw.trim();
                const direct = knownOptions.find(o => o.toLowerCase() === t.toLowerCase());
                if (direct) return direct;
                // Texto plano que claramente no es un hash de 64 hex
                if (t && !/^[0-9a-f]{64}$/i.test(t) && /[a-záéíóúñ]/i.test(t)) return t;
            }
            const h = normalizeHash(raw);
            if (h) { const m = knownOptions.find(o => sha256Hex(o) === h); if (m) return m; }
        }
    }
    return null;
}

// Decodifica directamente desde un pollUpdateMessage (cubre formato `vote.selectedOptions` y `votes[]`).
export function decodePollUpdate(pum, knownOptions = STANDARD_POLL_OPTIONS) {
    if (!pum) return null;
    const fromSelected = decodeSelectedOption(pum?.vote?.selectedOptions, knownOptions);
    if (fromSelected) return fromSelected;
    if (Array.isArray(pum?.votes) && pum.votes.length) return pum.votes[0]?.optionName || pum.votes[0]?.name || null;
    return null;
}

// Extrae el teléfono real de un `key` de mensaje, priorizando remoteJidAlt (@lid → número real).
export function realPhoneFromKey(key) {
    const jid = key?.remoteJidAlt || key?.remoteJid || '';
    return normalizePhone(jid.split('@')[0]);
}

export function normalizePhone(raw) {
    let phone = String(raw || '').replace(/\D/g, '');
    if (phone.length === 13 && phone.startsWith('521')) phone = '52' + phone.substring(3);
    if (phone.length === 10) phone = '52' + phone;
    return phone;
}

function targetStatusFor(option) {
    const o = (option || '').toLowerCase();
    if (o.includes('confirm')) return 'confirmed';
    if (o.includes('reagend') || o.includes('reprogram') || o.includes('cambio')) return 'rescheduling';
    if (o.includes('cancel')) return 'cancelled';
    return null;
}

// Barre el store de Evolution, decodifica votos pendientes y actualiza el status
// de la cita correspondiente. Idempotente (no toca citas que ya están en el status destino).
// No envía mensajes a las clientas (solo actualiza estado), para que sea seguro correrlo en cron.
export async function reconcilePollVotes({ apply = true, limit = 300 } = {}) {
    const evo = getEvolutionClient();
    let records = [];
    try {
        const data = await evo.findRecentMessages(limit);
        records = data;
    } catch (err) {
        console.warn('[pollVotes] No se pudieron traer mensajes:', err.message);
        return { scanned: 0, votes: 0, changes: [] };
    }

    const votes = records.filter(m => m?.message?.pollUpdateMessage);
    const changes = [];
    const marginDate = new Date(Date.now() - 2 * 60 * 60 * 1000);

    for (const m of votes) {
        const pum = m.message.pollUpdateMessage;
        const option = decodePollUpdate(pum);
        const target = targetStatusFor(option);
        if (!target) continue;

        const phone = realPhoneFromKey(m.key);
        const last10 = phone.slice(-10);

        // 1) TODAS las citas del poll (encuesta consolidada → varios pendingPolls
        //    con el mismo prefijo de pollMsgId); 2) fallback por teléfono.
        let appts = [];
        const pollId = pum?.pollCreationMessageKey?.id;
        if (pollId) {
            const pps = await prisma.pendingPoll.findMany({
                where: { OR: [{ id: pollId }, { id: { startsWith: pollId + '_' } }] }
            });
            const apptIds = [...new Set(pps.map(p => p.appointmentId).filter(Boolean))];
            if (apptIds.length) appts = await prisma.appointment.findMany({ where: { id: { in: apptIds } } });
        }
        if (appts.length === 0) {
            const one = await prisma.appointment.findFirst({
                where: {
                    clientPhone: { endsWith: last10 },
                    status: { in: ['scheduled', 'confirmed', 'rescheduling'] },
                    startDateTime: { gte: marginDate }
                },
                orderBy: { startDateTime: 'asc' }
            });
            if (one) appts = [one];
        }

        for (const appt of appts) {
            if (!appt || appt.status === target) continue;
            const change = { appointmentId: appt.id, client: appt.clientName, service: appt.serviceName, from: appt.status, to: target, option };
            if (apply) {
                const data = { status: target, updatedAt: new Date() };
                if (target === 'confirmed') { data.confirmedAt = new Date(); data.confirmedVia = 'whatsapp-reconciled'; }
                if (target === 'cancelled') { data.cancelledAt = new Date(); data.cancelledVia = 'whatsapp-reconciled'; }
                if (target === 'rescheduling') { data.rescheduleRequestedAt = new Date(); }
                await prisma.appointment.update({ where: { id: appt.id }, data });
            }
            changes.push(change);
        }
    }

    return { scanned: records.length, votes: votes.length, changes };
}

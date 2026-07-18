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
import { WhatsAppService } from './whatsapp-v2.js';

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

// Teléfono → JID de WhatsApp (formato del store de Evolution).
export function phoneToJid(raw) {
    return `${normalizePhone(raw)}@s.whatsapp.net`;
}

// Candidatos de JID para consultar el store: WhatsApp MX guarda los chats con
// '521…' (prefijo móvil legacy; ej. real documentado arriba: 5214271908849),
// pero también existe la forma '52…'. Probar 521 primero.
export function jidCandidates(raw) {
    const tel = normalizePhone(raw);
    const jids = [];
    if (/^52\d{10}$/.test(tel)) jids.push(`521${tel.slice(2)}@s.whatsapp.net`);
    jids.push(`${tel}@s.whatsapp.net`);
    return jids;
}

// Une listas de registros del store quedándose SOLO con votos (pollUpdateMessage),
// deduplicados por key.id (el primero gana). Los registros sin key.id se
// conservan todos: no hay forma segura de dedupearlos.
export function mergeVoteRecords(...listas) {
    const seen = new Set();
    const out = [];
    for (const lista of listas) {
        for (const r of (lista || [])) {
            if (!r?.message?.pollUpdateMessage) continue;
            const id = r?.key?.id;
            if (id) {
                if (seen.has(id)) continue;
                seen.add(id);
            }
            out.push(r);
        }
    }
    return out;
}

function targetStatusFor(option) {
    const o = (option || '').toLowerCase();
    if (o.includes('confirm')) return 'confirmed';
    if (o.includes('reagend') || o.includes('reprogram') || o.includes('cambio')) return 'rescheduling';
    if (o.includes('cancel')) return 'cancelled';
    return null;
}

// ¿Se aplica este voto sobre la cita? Reglas (ver tests/sweepVoteGuard.test.js):
//  - 'scheduled': siempre (comportamiento histórico del barrido).
//  - 'confirmed' → rescheduling/cancelled: SOLO si el voto es POSTERIOR a la
//    confirmación (Mariel 11-jul: votó Reagendar sobre cita confirmada y el
//    barrido la ignoraba en silencio). El orden temporal evita el loop de
//    votos viejos re-aplicados (Stephanie 2-jul).
//  - 'cancelled'/'rescheduling': terminales para el barrido; solo el equipo
//    (o el webhook en vivo) las mueve.
export function shouldApplySweepVote({ status, target, voteTsMs, confirmedAtMs, updatedAtMs }) {
    if (!target || status === target) return false;
    if (status === 'scheduled') return true;
    if (status === 'confirmed' && (target === 'rescheduling' || target === 'cancelled')) {
        const anchor = confirmedAtMs != null ? confirmedAtMs : updatedAtMs;
        return voteTsMs != null && anchor != null && voteTsMs > anchor;
    }
    return false;
}

// Timestamp del voto en ms desde un registro del store de Evolution/Baileys.
// Viene como segundos (number o Long {low,high}); null si no se puede leer.
export function voteTimestampMs(record) {
    const raw = record?.messageTimestamp ?? record?.message?.messageTimestamp ?? null;
    if (raw == null) return null;
    const n = Number(raw?.low !== undefined ? raw.low : raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n > 1e12 ? n : n * 1000;
}

// Barre el store de Evolution, decodifica votos pendientes y actualiza el status
// de la cita correspondiente.
//
// Reglas de seguridad (aprendidas de incidentes reales):
//  - Barrido FILTRADO por messageType server-side: sin filtro, Evolution pagina
//    el store global y los votos recientes quedan fuera de la ventana → el
//    barrido estuvo ciego (0 rescates 2-10 jul aunque las clientas votaban).
//    Fallback al barrido sin filtro si el filtrado falla o viene vacío.
//  - Transición ONE-WAY: solo se aplica un voto si la cita sigue en 'scheduled'.
//    Antes, re-aplicar votos viejos sobre citas ya procesadas causó un loop
//    cancelled↔rescheduling cada 3 min (Stephanie, 2 jul). Con one-way, cada
//    cita cambia a lo más UNA vez por esta vía y nunca pisa decisiones
//    posteriores (del webhook, del admin o de la clienta por texto).
//  - ACUSE a la clienta (sendAcuse=true): como la transición es única, es
//    seguro responder. Confirmaciones del mismo teléfono se agrupan en un
//    solo mensaje; el acuse nunca bloquea el cambio de status si falla.
// Candado anti-traslape: el barrido corre desde 3 crons distintos (3min, y los
// dos de */10) y con hasta 30 llamadas HTTP puede tardar más que su intervalo;
// sin esto se apilan corridas martillando Evolution y la DB.
let reconcileEnCurso = false;

export async function reconcilePollVotes(opts = {}) {
    if (reconcileEnCurso) {
        return { scanned: 0, votes: 0, changes: [], source: 'skipped-overlap' };
    }
    reconcileEnCurso = true;
    try {
        return await reconcilePollVotesInner(opts);
    } finally {
        reconcileEnCurso = false;
    }
}

async function reconcilePollVotesInner({ apply = true, limit = 300, sendAcuse = true } = {}) {
    const evo = getEvolutionClient();
    let records = [];
    let source = 'filtered';
    try {
        // Primario: solo votos (messageType filtrado server-side)
        records = await evo.findRecentMessages(limit, { messageType: 'pollUpdateMessage' });
        if (!records.length) {
            // Fallback: barrido global sin filtro (versiones de Evolution que no
            // soporten el where por messageType)
            source = 'unfiltered-fallback';
            records = await evo.findRecentMessages(limit);
        } else if (records.some(r => !r?.message?.pollUpdateMessage)) {
            // El server IGNORÓ el filtro (devolvió mensajes mixtos): registrarlo
            // para que "filtro honrado" y "filtro ignorado" sean distinguibles
            // en logs — antes eran idénticos y ocultaron el barrido ciego.
            source = 'filter-ignored';
        }
    } catch (err) {
        try {
            source = 'unfiltered-after-error';
            records = await evo.findRecentMessages(limit);
        } catch (err2) {
            console.warn('[pollVotes] No se pudieron traer mensajes:', err2.message);
            return { scanned: 0, votes: 0, changes: [], source: 'error' };
        }
    }

    // ── Barrido DIRIGIDO por chat (incidente Thania 18-jul-2026: votó a las
    //    9AM y el barrido global nunca vio el voto → alerta de cancelación).
    //    El store global lo comparte una instancia que también manda campañas
    //    masivas: con ventana de 300 mensajes un voto se entierra fácil.
    //    Consultar el CHAT de cada clienta con encuesta reciente es barato
    //    (pocas encuestas/día) y ahí el voto no se puede enterrar.
    let targeted = [];
    try {
        const desde = new Date(Date.now() - 72 * 60 * 60 * 1000);
        const activos = await prisma.pendingPoll.findMany({
            where: { createdAt: { gte: desde } },
            select: { phone: true },
            orderBy: { createdAt: 'desc' }, // si hay que capar, que caiga lo más viejo
        });
        const telefonos = [...new Set(activos.map(p => normalizePhone(p.phone)))]
            .filter(t => /^\d{11,15}$/.test(t));
        if (telefonos.length > 30) console.warn(`[pollVotes] barrido dirigido: ${telefonos.length} chats activos, limitando a 30`);
        let chatsVacios = 0;
        for (const tel of telefonos.slice(0, 30)) {
            try {
                let encontrado = false;
                for (const jid of jidCandidates(tel)) {
                    const msgs = await evo.fetchMessages(jid, 60);
                    if (msgs.length) { targeted.push(...msgs); encontrado = true; break; }
                }
                if (!encontrado) chatsVacios++;
            } catch (e) { /* chat sin mensajes o filtro no soportado: seguir */ }
        }
        // Chat con encuesta activa que regresa 0 mensajes = señal de JID/@lid o
        // paginación rota; si esto crece, el barrido dirigido está ciego.
        if (chatsVacios > 0) console.warn(`[pollVotes] barrido dirigido: ${chatsVacios} chat(s) con encuesta activa regresaron 0 mensajes`);
    } catch (e) {
        console.warn('[pollVotes] barrido dirigido falló (sigo con el global):', e.message);
    }

    const globalVotes = records.filter(m => m?.message?.pollUpdateMessage);
    // Orden DESC garantizado client-side: si la versión de Evolution devolviera
    // viejo-primero, un voto corregido aplicaría el estado viejo. Más reciente gana.
    const votes = mergeVoteRecords(records, targeted)
        .sort((a, b) => (voteTimestampMs(b) || 0) - (voteTimestampMs(a) || 0));
    if (votes.length > globalVotes.length) {
        console.log(`[pollVotes] 🎯 barrido dirigido rescató ${votes.length - globalVotes.length} voto(s) que el global no veía`);
    }
    const changes = [];
    // Descartes contados por razón: sin esto cada regresión parece "nadie votó".
    const desc = { cifrados: 0, indecodificables: 0, opcionDesconocida: 0, opcionAjena: 0, sinCita: 0, carreraPerdida: 0 };
    const marginDate = new Date(Date.now() - 2 * 60 * 60 * 1000);

    for (const m of votes) {
        const pum = m.message.pollUpdateMessage;
        const option = decodePollUpdate(pum);
        if (!option) {
            // encPayload sin selectedOptions = Evolution no pudo descifrar el voto
            // (reinicio de instancia / poll original fuera de su store).
            if (pum?.vote?.encPayload) desc.cifrados++;
            else desc.indecodificables++;
            continue;
        }
        const target = targetStatusFor(option);
        if (!target) { desc.opcionDesconocida++; continue; }

        const phone = realPhoneFromKey(m.key);
        const last10 = phone.slice(-10);

        // 1) TODAS las citas del poll (encuesta consolidada → varios pendingPolls
        //    con el mismo prefijo de pollMsgId); 2) fallback por teléfono.
        let appts = [];
        let pollConocido = false; // el voto ES de una encuesta nuestra mapeada
        const pollId = pum?.pollCreationMessageKey?.id;
        if (pollId) {
            const pps = await prisma.pendingPoll.findMany({
                where: { OR: [{ id: pollId }, { id: { startsWith: pollId + '_' } }] }
            });
            const apptIds = [...new Set(pps.map(p => p.appointmentId).filter(Boolean))];
            pollConocido = apptIds.length > 0;
            if (apptIds.length) {
                appts = await prisma.appointment.findMany({
                    where: { id: { in: apptIds }, startDateTime: { gte: marginDate } }
                });
            }
        }
        if (pollConocido && appts.length === 0) {
            // El poll matcheó pero SU cita ya pasó/no existe: jamás redirigir el
            // voto viejo a OTRA cita futura de la clienta vía fallback (un
            // "Cancelar" del miércoles cancelaría la cita nueva del sábado).
            desc.sinCita++;
            continue;
        }
        if (appts.length === 0) {
            // Fallback por teléfono SOLO para votos de NUESTRAS encuestas: la
            // instancia se comparte con otros negocios y un voto a un poll ajeno
            // cuya opción contenga 'confirmar'/'cancelar' mutaría citas de Venus.
            const esOpcionEstandar = STANDARD_POLL_OPTIONS.some(o => o.toLowerCase() === String(option).trim().toLowerCase());
            if (!esOpcionEstandar) { desc.opcionAjena++; continue; }
            const one = await prisma.appointment.findFirst({
                where: {
                    clientPhone: { endsWith: last10 },
                    status: { in: ['scheduled', 'confirmed'] },
                    startDateTime: { gte: marginDate }
                },
                orderBy: { startDateTime: 'asc' }
            });
            if (one) appts = [one];
            else { desc.sinCita++; continue; }
        }

        const voteTsMs = voteTimestampMs(m);
        for (const appt of appts) {
            if (!appt) continue;
            // Guard temporal (ver shouldApplySweepVote): scheduled siempre;
            // confirmed solo con voto posterior a la confirmación; el resto no.
            const ok = shouldApplySweepVote({
                status: appt.status,
                target,
                voteTsMs,
                confirmedAtMs: appt.confirmedAt ? new Date(appt.confirmedAt).getTime() : null,
                updatedAtMs: appt.updatedAt ? new Date(appt.updatedAt).getTime() : null
            });
            if (!ok) continue;
            const change = {
                appointmentId: appt.id, client: appt.clientName, service: appt.serviceName,
                from: appt.status, to: target, option, appt,
            };
            if (apply) {
                const data = { status: target, updatedAt: new Date() };
                if (target === 'confirmed') { data.confirmedAt = new Date(); data.confirmedVia = 'whatsapp-reconciled'; }
                if (target === 'cancelled') { data.cancelledAt = new Date(); data.cancelledVia = 'whatsapp-reconciled'; }
                if (target === 'rescheduling') { data.rescheduleRequestedAt = new Date(); }
                // Transición ATÓMICA (status como precondición): el barrido corre
                // desde 3 crons sin lock y puede traslaparse consigo mismo; sin
                // esto dos corridas aplicaban el mismo voto y duplicaban acuses.
                const result = await prisma.appointment.updateMany({
                    where: { id: appt.id, status: appt.status },
                    data
                });
                if (result.count === 0) { desc.carreraPerdida++; continue; }
            }
            changes.push(change);
        }
    }

    // ── Acuse a las clientas. Cada cita llega aquí a lo más una vez en su vida
    //    (one-way), así que no hay riesgo de spamear. Confirmaciones del mismo
    //    teléfono van en UN mensaje consolidado.
    if (apply && sendAcuse && changes.length > 0) {
        const confirmedByPhone = new Map();
        for (const c of changes) {
            if (c.to === 'confirmed') {
                const key = c.appt.clientPhone;
                if (!confirmedByPhone.has(key)) confirmedByPhone.set(key, []);
                confirmedByPhone.get(key).push(c.appt);
            }
        }
        for (const [, citas] of confirmedByPhone) {
            try { await WhatsAppService.sendConfirmacionRecibidaMultiple(citas); }
            catch (e) { console.warn('[pollVotes] acuse confirmación falló:', e.message); }
        }
        // Reagendar/cancelar: UN acuse por clienta aunque el voto consolidado
        // haya movido varias citas (el texto del acuse es genérico; N copias
        // idénticas son spam).
        const acusados = new Set();
        for (const c of changes) {
            if (c.to !== 'rescheduling' && c.to !== 'cancelled') continue;
            const k = `${c.appt.clientPhone}|${c.to}`;
            if (acusados.has(k)) continue;
            acusados.add(k);
            try {
                if (c.to === 'rescheduling') await WhatsAppService.sendSolicitudReprogramacion(c.appt);
                else if (c.to === 'cancelled') await WhatsAppService.sendCancelacionConfirmada(c.appt);
            } catch (e) { console.warn('[pollVotes] acuse falló:', e.message); }
        }
    }

    // Observabilidad: con esto, "nadie votó" y "voto perdido" dejan de verse igual.
    const descartados = Object.entries(desc).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(' ');
    if (votes.length > 0 || descartados) {
        console.log(`[pollVotes] source=${source} escaneados=${records.length} dirigidos=${targeted.length} votos=${votes.length} aplicados=${changes.length}${descartados ? ' descartes: ' + descartados : ''}`);
    }

    // No exponer el objeto appt completo hacia afuera (logs/JSON del endpoint)
    const publicChanges = changes.map(({ appt, ...rest }) => rest);
    return { scanned: records.length, targetedScanned: targeted.length, votes: votes.length, changes: publicChanges, source, descartes: desc };
}

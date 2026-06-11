// src/services/pollReconciler.js
//
// Reconciliación de votos perdidos de encuestas WhatsApp.
//
// Problema observado en producción: el webhook de Evolution a veces no
// procesa el voto del poll (formato de evento, race condition, red, etc.),
// y la cita queda en `scheduled` aunque la clienta sí haya respondido.
// Hasta hace poco esto se rescataba SOLO con el botón manual
// "Reconciliar respuestas" del admin. Ahora también lo usa el scheduler
// del aviso 4h ANTES de molestar a la clienta con "Confirmación pendiente".
//
import { prisma } from '../db/index.js';
import { matchOptionByHash } from '../routes/webhookEvolution.js';

function normalizePhone(rawPhone) {
  let phone = String(rawPhone || '').replace(/\D/g, '');
  if (phone.length === 13 && phone.startsWith('521')) phone = '52' + phone.substring(3);
  if (phone.length === 10) phone = '52' + phone;
  return phone;
}

/**
 * Busca en los mensajes recientes del chat de la clienta si ya respondió
 * la encuesta (poll vote o texto libre) y actualiza la cita en consecuencia.
 *
 * @param {Object} appointment - registro de Appointment (al menos id, clientPhone)
 * @returns {Promise<'confirmed'|'cancelled'|'rescheduling'|null>}
 *          nuevo status si se reconcilió, null si nada que rescatar
 */
export async function reconcileAppointment(appointment) {
  if (!appointment?.id || !appointment?.clientPhone) return null;

  let evo;
  try {
    const { getEvolutionClient } = await import('./whatsapp-evolution.js');
    evo = getEvolutionClient();
  } catch (e) {
    console.warn('[pollReconciler] Evolution client no disponible:', e.message);
    return null;
  }

  const phone = normalizePhone(appointment.clientPhone);
  if (!phone) return null;
  const jid = phone + '@s.whatsapp.net';

  // PendingPolls de esta cita (para decodificar hashes y matchear pollId)
  let apptPolls = [];
  try {
    apptPolls = await prisma.pendingPoll.findMany({
      where: { appointmentId: appointment.id }
    });
  } catch { /* ignore */ }
  const apptPollIds = new Set(apptPolls.map(p => p.id));

  // Mensajes recientes del chat
  let messages = [];
  try {
    messages = await evo.fetchMessages(jid, 30);
  } catch (e) {
    console.warn(`[pollReconciler] fetchMessages falló para ${appointment.id}:`, e.message);
    return null;
  }

  let found = null;
  for (const msg of messages) {
    const pollUpdate = msg?.message?.pollUpdateMessage;
    // Texto libre del cliente (no nuestro), excepto polls que vienen fromMe=true
    if (!pollUpdate && msg?.key?.fromMe) continue;

    const text = (msg?.message?.conversation
      || msg?.message?.extendedTextMessage?.text
      || '').toLowerCase().trim();

    let pollOption = null;
    if (pollUpdate) {
      if (Array.isArray(pollUpdate?.votes)) {
        pollOption = (pollUpdate.votes[0]?.optionName || pollUpdate.votes[0]?.name || '').toLowerCase();
      }
      if (!pollOption && Array.isArray(pollUpdate?.vote?.selectedOptions)) {
        const hashes = pollUpdate.vote.selectedOptions;
        const targetPollId = pollUpdate?.pollCreationMessageKey?.id;
        const pollsToTry = targetPollId && apptPollIds.has(targetPollId)
          ? apptPolls.filter(p => p.id === targetPollId && p.options)
          : apptPolls.filter(p => p.options);
        for (const pp of pollsToTry) {
          try {
            const opts = JSON.parse(pp.options);
            for (const h of hashes) {
              const matched = matchOptionByHash(opts, h);
              if (matched) { pollOption = matched.toLowerCase(); break; }
            }
          } catch { /* ignore */ }
          if (pollOption) break;
        }
        if (!pollOption) {
          const fallbackOpts = ['Confirmar asistencia', 'Reagendar', 'Cancelar'];
          for (const h of hashes) {
            const matched = matchOptionByHash(fallbackOpts, h);
            if (matched) { pollOption = matched.toLowerCase(); break; }
          }
        }
      }
    }

    const respuesta = pollOption || text;
    if (!respuesta) continue;

    if (respuesta.includes('confirmar') || respuesta.includes('confirmo') || respuesta === '1') {
      found = 'confirmed'; break;
    } else if (respuesta.includes('cancelar') || respuesta === '3') {
      found = 'cancelled'; break;
    } else if (respuesta.includes('reagendar') || respuesta.includes('reprogramar') || respuesta === '2') {
      found = 'rescheduling'; break;
    }
  }

  if (!found) return null;

  try {
    if (found === 'confirmed') {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'confirmed', confirmedAt: new Date(), confirmedVia: 'whatsapp-prealert-reconciled', updatedAt: new Date() }
      });
    } else if (found === 'cancelled') {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelledVia: 'whatsapp-prealert-reconciled', updatedAt: new Date() }
      });
    } else if (found === 'rescheduling') {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'rescheduling', rescheduleRequestedAt: new Date(), updatedAt: new Date() }
      });
    }
    return found;
  } catch (e) {
    console.warn(`[pollReconciler] update falló para ${appointment.id}:`, e.message);
    return null;
  }
}

export default { reconcileAppointment };

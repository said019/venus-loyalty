// src/routes/webhookEvolution.js - Webhook para respuestas de WhatsApp (Evolution API)
// 100% PostgreSQL via Prisma — sin Firestore
import express from 'express';
import { prisma } from '../db/index.js';
import { AppointmentsRepo, NotificationsRepo } from '../db/repositories.js';
import { WhatsAppService } from '../services/whatsapp-v2.js';
import { toMexicoCityISO } from '../utils/mexico-time.js';

const router = express.Router();

function normalizePhone(raw) {
    let phone = raw.replace(/\D/g, '');
    if (phone.length === 13 && phone.startsWith('521')) phone = '52' + phone.substring(3);
    if (phone.length === 10) phone = '52' + phone;
    return phone;
}

async function saveIncomingMessage(phone, name, body, messageId = null) {
    try {
        await prisma.whatsappMessage.create({
            data: { phone, name, body, direction: 'in', read: false, messageId }
        });
    } catch (err) {
        console.warn('[Evolution] Error guardando mensaje entrante:', err.message);
    }
}

router.post('/', async (req, res) => {
    try {
        const { event, data, instance } = req.body;
        console.log(`[Evolution Webhook] Evento: ${event} | Instancia: ${instance}`);
        switch (event) {
            case 'qrcode.updated':
                console.log('[Evolution] QR Code actualizado');
                break;
            case 'connection.update':
                console.log(`[Evolution] Estado de conexión: ${data?.state || data?.status}`);
                break;
            case 'messages.upsert':
                await handleIncomingMessage(data);
                break;
            default:
                console.log(`[Evolution Webhook] Evento no manejado: ${event}`);
        }
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('[Evolution Webhook] Error:', error);
        res.status(200).json({ received: true });
    }
});

async function handleIncomingMessage(data) {
    try {
        const message = data?.messages?.[0] || data;
        if (message?.key?.fromMe) return;
        const from = message?.key?.remoteJid?.replace('@s.whatsapp.net', '') || '';
        const profileName = data?.pushName || message?.pushName || 'Cliente';

        if (message?.message?.pollUpdateMessage || data?.pollUpdate) {
            console.log(`[Evolution] Respuesta de Poll de ${from}`);
            await handlePollResponse(from, data, profileName);
            return;
        }

        const text = message?.message?.conversation ||
            message?.message?.extendedTextMessage?.text ||
            data?.body || '';

        if (!text) { console.log(`[Evolution] Mensaje sin texto de ${from}, ignorando`); return; }

        console.log(`[Evolution] Mensaje de ${from} (${profileName}): ${text}`);
        const phone = normalizePhone(from);
        await saveIncomingMessage(phone, profileName, text, message?.key?.id);
        await processClientResponse(from, text.toLowerCase().trim());
    } catch (error) {
        console.error('[Evolution] Error procesando mensaje:', error);
    }
}

async function handlePollResponse(phone, payload, profileName) {
    let selectedOption = null;
    const votes = payload?.pollUpdate?.votes;
    if (Array.isArray(votes) && votes.length > 0) selectedOption = votes[0]?.optionName || votes[0]?.name;
    if (!selectedOption) selectedOption = payload?.body || payload?.data?.body || null;

    console.log(`[Evolution] Poll respuesta: "${selectedOption}" de ${phone}`);
    if (!selectedOption) { console.log('[Evolution] No se pudo determinar la opción seleccionada'); return; }

    const pollMsgId = payload?.message?.pollUpdateMessage?.pollCreationMessageKey?.id
        || payload?.pollUpdate?.pollCreationMessageKey?.id || null;

    let citaDirecta = null;
    if (pollMsgId) {
        try {
            const pollRow = await prisma.pendingPoll.findUnique({ where: { id: pollMsgId } });
            if (pollRow) {
                citaDirecta = await AppointmentsRepo.findById(pollRow.appointmentId);
                if (citaDirecta) console.log(`✅ [Evolution] Cita identificada por pollMsgId: ${pollRow.appointmentId}`);
            }
        } catch (lookupErr) {
            console.warn('[Evolution] Error buscando cita por pollMsgId:', lookupErr.message);
        }
    }

    const opt = selectedOption.toLowerCase();
    if (opt.includes('confirmar')) await processClientResponse(phone, 'confirmar', citaDirecta);
    else if (opt.includes('reagendar') || opt.includes('cambio') || opt.includes('reprogramar')) await processClientResponse(phone, 'reagendar', citaDirecta);
    else if (opt.includes('cancelar')) await processClientResponse(phone, 'cancelar', citaDirecta);
    else console.log(`[Evolution] Opción de poll no reconocida: ${selectedOption}`);
}

async function processClientResponse(telefono, respuesta, citaDirecta = null) {
    const cita = citaDirecta || await buscarCitaActiva(telefono);
    if (!cita) { console.log(`⚠️ No se encontró cita activa para ${telefono}`); return; }

    if (respuesta.includes('confirmo') || respuesta.includes('confirmar') || respuesta === '1') await procesarConfirmacion(cita);
    else if (respuesta.includes('reagendar') || respuesta.includes('reprogramar') || respuesta.includes('cambio') || respuesta === '2') await procesarReagendamiento(cita);
    else if (respuesta.includes('cancelar') || respuesta === '3') await procesarCancelacion(cita);
    else if (cita.status === 'rescheduling') await procesarFechaReagendamiento(cita, telefono, respuesta);
    else console.log(`❓ Respuesta no reconocida: ${respuesta}`);
}

async function buscarCitaActiva(telefono) {
    try {
        const phone = normalizePhone(telefono);
        console.log(`🔍 [Evolution] Buscando cita para: ${phone}`);
        const marginDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const validStatuses = ['scheduled', 'confirmed', 'rescheduling'];

        let results = await prisma.appointment.findMany({
            where: { clientPhone: phone, startDateTime: { gte: marginDate }, status: { in: validStatuses } },
            orderBy: { startDateTime: 'asc' }
        });

        if (results.length === 0) {
            const last10 = phone.slice(-10);
            results = await prisma.appointment.findMany({
                where: { clientPhone: { endsWith: last10 }, startDateTime: { gte: marginDate }, status: { in: validStatuses } },
                orderBy: { startDateTime: 'asc' }
            });
        }

        if (results.length > 0) { console.log(`✅ Cita encontrada: ${results[0].id} - ${results[0].clientName}`); return results[0]; }
        return null;
    } catch (error) {
        console.error('❌ Error buscando cita:', error);
        return null;
    }
}

async function procesarConfirmacion(cita) {
    console.log(`✅ Procesando confirmación para cita ${cita.id}`);
    try {
        await prisma.appointment.update({
            where: { id: cita.id },
            data: { status: 'confirmed', confirmedAt: new Date(), confirmedVia: 'whatsapp-evolution', updatedAt: new Date() }
        });
        await NotificationsRepo.create({ type: 'cita', icon: 'calendar-check', title: 'Cita confirmada', message: `${cita.clientName} confirmó ${cita.serviceName}`, read: false, entityId: cita.id });
        await WhatsAppService.sendConfirmacionRecibida(cita);
        console.log(`✅ Cita ${cita.id} confirmada exitosamente`);
    } catch (error) { console.error('Error procesando confirmación:', error); }
}

async function procesarReagendamiento(cita) {
    console.log(`🔄 Procesando reagendamiento para cita ${cita.id}`);
    try {
        await prisma.appointment.update({
            where: { id: cita.id },
            data: { status: 'rescheduling', rescheduleRequestedAt: new Date(), updatedAt: new Date() }
        });
        await NotificationsRepo.create({ type: 'alerta', icon: 'calendar-times', title: 'Solicitud de reagendamiento', message: `${cita.clientName} quiere reagendar ${cita.serviceName}`, read: false, entityId: cita.id });
        await WhatsAppService.sendSolicitudReprogramacion(cita);
        console.log(`🔄 Solicitud de reagendamiento enviada para cita ${cita.id}`);
    } catch (error) { console.error('Error procesando reagendamiento:', error); }
}

async function procesarFechaReagendamiento(cita, telefono, fechaTexto) {
    console.log(`📅 Fecha de reagendamiento recibida para cita ${cita.id}: "${fechaTexto}"`);
    try {
        await prisma.appointment.update({ where: { id: cita.id }, data: { updatedAt: new Date() } });
        await NotificationsRepo.create({ type: 'alerta', icon: 'calendar-alt', title: 'Propuesta de reagendamiento', message: `${cita.clientName} propone reagendar ${cita.serviceName} para: "${fechaTexto}"`, read: false, entityId: cita.id });
        const { getEvolutionClient } = await import('../services/whatsapp-evolution.js');
        const evo = getEvolutionClient();
        await evo.sendText(telefono, `✅ ¡Perfecto ${cita.clientName}! Recibimos tu solicitud para reagendar tu cita de *${cita.serviceName}* para el *${fechaTexto}*.\n\nNuestro equipo revisará la disponibilidad y te confirmará a la brevedad. 🌸`);
        console.log(`📅 Propuesta de reagendamiento guardada para cita ${cita.id}: ${fechaTexto}`);
    } catch (error) { console.error('Error procesando fecha de reagendamiento:', error); }
}

async function procesarCancelacion(cita) {
    console.log(`❌ Procesando cancelación para cita ${cita.id}`);
    try {
        await prisma.appointment.update({
            where: { id: cita.id },
            data: { status: 'cancelled', cancelledAt: new Date(), cancelledVia: 'whatsapp-evolution', updatedAt: new Date() }
        });
        try {
            const { deleteEvent } = await import('../services/googleCalendarService.js');
            const { config } = await import('../config/config.js');
            if (cita.googleCalendarEventId) await deleteEvent(cita.googleCalendarEventId, config.google.calendarOwner1).catch(e => console.error('Cal1:', e.message));
            if (cita.googleCalendarEventId2) await deleteEvent(cita.googleCalendarEventId2, config.google.calendarOwner2).catch(e => console.error('Cal2:', e.message));
        } catch (calErr) { console.error('⚠️ Error eliminando eventos del calendario:', calErr.message); }
        await NotificationsRepo.create({ type: 'alerta', icon: 'calendar-times', title: 'Cita cancelada', message: `${cita.clientName} canceló ${cita.serviceName}`, read: false, entityId: cita.id });
        await WhatsAppService.sendCancelacionConfirmada(cita);
        console.log(`❌ Cita ${cita.id} cancelada exitosamente`);
    } catch (error) { console.error('Error procesando cancelación:', error); }
}

export default router;

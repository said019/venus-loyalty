// src/routes/whatsappWebhook.js - Webhook para respuestas de WhatsApp (Twilio)
// 100% PostgreSQL via Prisma — sin Firestore
import express from 'express';
import { prisma } from '../db/index.js';
import { NotificationsRepo } from '../db/repositories.js';
import { WhatsAppService } from '../services/whatsapp-v2.js';

const router = express.Router();

/**
 * Webhook para recibir mensajes de WhatsApp (Twilio)
 * POST /api/whatsapp/webhook
 */
router.post('/webhook', async (req, res) => {
    try {
        console.log('📥 Webhook recibido:', JSON.stringify(req.body, null, 2));

        const { From, Body, ButtonText, ButtonPayload, MessageSid } = req.body;

        const telefono = From?.replace('whatsapp:', '').replace('+', '') || '';
        console.log(`📩 Mensaje recibido de ${telefono}: ${Body || ButtonText}`);

        const respuesta = (ButtonText || Body || '').toLowerCase().trim();

        const cita = await buscarCitaActiva(telefono);

        if (!cita) {
            console.log(`⚠️ No se encontró cita activa para ${telefono}`);
            const { WhatsAppService: WS } = await import('../services/whatsapp.js');
            await WS.sendWhatsAppText(telefono, 'Lo siento, no encontré ninguna cita próxima pendiente de confirmar para este número. Por favor verifica con administración.');
            return res.status(200).send('OK');
        }

        if (respuesta.includes('confirmo') || respuesta === '1' || respuesta === 'confirmar') {
            await procesarConfirmacion(cita);
        } else if (respuesta.includes('reprogramar') || respuesta === '2') {
            await procesarReprogramacion(cita);
        } else if (respuesta.includes('cancelar') || respuesta === '3') {
            await procesarCancelacion(cita);
        } else {
            console.log(`❓ Respuesta no reconocida: ${respuesta}`);
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error('❌ Error en webhook WhatsApp:', error);
        res.status(500).send('Error');
    }
});

async function buscarCitaActiva(telefono) {
    try {
        let phone = telefono.replace(/\D/g, '');
        if (phone.length === 13 && phone.startsWith('521')) phone = '52' + phone.substring(3);
        else if (phone.length === 10) phone = '52' + phone;

        console.log(`🔍 Buscando cita para teléfono normalizado: ${phone}`);

        const marginDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const validStatuses = ['scheduled', 'confirmed', 'rescheduling'];

        let results = await prisma.appointment.findMany({
            where: { clientPhone: phone, startDateTime: { gte: marginDate }, status: { in: validStatuses } },
            orderBy: { startDateTime: 'asc' }
        });

        console.log(`📦 Citas encontradas por teléfono exacto (${phone}): ${results.length}`);

        if (results.length > 0) {
            console.log(`✅ Usando cita: ${results[0].id} - ${results[0].clientName}`);
            return results[0];
        }

        // Búsqueda por últimos 10 dígitos
        const last10 = phone.slice(-10);
        console.log(`⚠️ No encontrado exacto. Buscando por terminación: ...${last10}`);

        const allRecent = await prisma.appointment.findMany({
            where: { startDateTime: { gte: marginDate }, status: { in: validStatuses } },
            orderBy: { startDateTime: 'asc' }
        });

        const match = allRecent.find(a => (a.clientPhone || '').replace(/\D/g, '').endsWith(last10));
        if (match) { console.log(`✅ Encontrado por coincidencia parcial: ${match.id}`); return match; }

        console.log('❌ No se encontró ninguna cita activa');
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
            data: { status: 'confirmed', confirmedAt: new Date(), confirmedVia: 'whatsapp', updatedAt: new Date() }
        });
        await NotificationsRepo.create({ type: 'cita', icon: 'calendar-check', title: 'Cita confirmada', message: `${cita.clientName} confirmó ${cita.serviceName}`, read: false, entityId: cita.id });
        await WhatsAppService.sendConfirmacionRecibida(cita);
        console.log(`✅ Cita ${cita.id} confirmada exitosamente`);
    } catch (error) { console.error('Error procesando confirmación:', error); }
}

async function procesarReprogramacion(cita) {
    console.log(`🔄 Procesando reprogramación para cita ${cita.id}`);
    try {
        await prisma.appointment.update({
            where: { id: cita.id },
            data: { status: 'rescheduling', rescheduleRequestedAt: new Date(), updatedAt: new Date() }
        });
        await NotificationsRepo.create({ type: 'alerta', icon: 'calendar-times', title: 'Solicitud de reprogramación', message: `${cita.clientName} quiere reprogramar ${cita.serviceName}`, read: false, entityId: cita.id });
        await WhatsAppService.sendSolicitudReprogramacion(cita);
        console.log(`🔄 Solicitud de reprogramación enviada para cita ${cita.id}`);
    } catch (error) { console.error('Error procesando reprogramación:', error); }
}

async function procesarCancelacion(cita) {
    console.log(`❌ Procesando cancelación para cita ${cita.id}`);
    try {
        await prisma.appointment.update({
            where: { id: cita.id },
            data: { status: 'cancelled', cancelledAt: new Date(), cancelledVia: 'whatsapp', updatedAt: new Date() }
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

// src/routes/webhookEvolution.js - Webhook para respuestas de WhatsApp (Evolution API)
import express from 'express';
import { firestore } from '../db/compat.js';
import { WhatsAppService } from '../services/whatsapp-v2.js';

const router = express.Router();

/**
 * Webhook para recibir eventos de Evolution API
 * POST /api/webhook/evolution
 */
router.post('/', async (req, res) => {
    try {
        const { event, data, instance } = req.body;

        console.log(`[Evolution Webhook] Evento: ${event} | Instancia: ${instance}`);

        switch (event) {
            case 'qrcode.updated':
                console.log('[Evolution] QR Code actualizado');
                // El QR se maneja via polling desde el frontend
                break;

            case 'connection.update':
                const state = data?.state || data?.status;
                console.log(`[Evolution] Estado de conexión: ${state}`);
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
        res.status(200).json({ received: true }); // Siempre 200 para no reintentar
    }
});

/**
 * Procesa mensaje entrante de Evolution API
 */
async function handleIncomingMessage(data) {
    try {
        const message = data?.messages?.[0] || data;

        // Ignorar mensajes propios
        if (message?.key?.fromMe) {
            return;
        }

        const from = message?.key?.remoteJid?.replace('@s.whatsapp.net', '') || '';
        const profileName = data?.pushName || message?.pushName || 'Cliente';

        // Detectar respuesta de Poll
        if (message?.message?.pollUpdateMessage || data?.pollUpdate) {
            console.log(`[Evolution] Respuesta de Poll de ${from}`);
            await handlePollResponse(from, data, profileName);
            return;
        }

        // Detectar mensaje de texto normal
        const text = message?.message?.conversation ||
            message?.message?.extendedTextMessage?.text ||
            data?.body || '';

        if (!text) {
            console.log(`[Evolution] Mensaje sin texto de ${from}, ignorando`);
            return;
        }

        console.log(`[Evolution] Mensaje de ${from} (${profileName}): ${text}`);

        // Guardar mensaje en Firestore
        try {
            let phone = from.replace(/\D/g, '');
            if (phone.length === 13 && phone.startsWith('521')) phone = '52' + phone.substring(3);
            if (phone.length === 10) phone = '52' + phone;

            await firestore.collection('whatsapp_messages').add({
                phone,
                name: profileName,
                body: text,
                direction: 'in',
                timestamp: new Date().toISOString(),
                read: false,
                messageId: message?.key?.id || null,
            });
        } catch (saveErr) {
            console.error('[Evolution] Error guardando mensaje entrante:', saveErr.message);
        }

        // Procesar como respuesta de texto
        await processClientResponse(from, text.toLowerCase().trim());

    } catch (error) {
        console.error('[Evolution] Error procesando mensaje:', error);
    }
}

/**
 * Procesa respuesta de Poll de Evolution API
 */
async function handlePollResponse(phone, payload, profileName) {
    let selectedOption = null;

    // Formato 1: votes array
    if (payload?.pollUpdate?.votes) {
        const votes = payload.pollUpdate.votes;
        if (Array.isArray(votes) && votes.length > 0) {
            selectedOption = votes[0]?.optionName || votes[0]?.name;
        }
    }

    // Formato 2: body con texto de opción
    if (!selectedOption && payload?.body) {
        selectedOption = payload.body;
    }

    // Formato 3: data.body
    if (!selectedOption && payload?.data?.body) {
        selectedOption = payload.data.body;
    }

    console.log(`[Evolution] Poll respuesta: "${selectedOption}" de ${phone}`);

    if (!selectedOption) {
        console.log('[Evolution] No se pudo determinar la opción seleccionada');
        return;
    }

    const optionLower = selectedOption.toLowerCase();

    if (optionLower.includes('confirmar')) {
        await processClientResponse(phone, 'confirmar');
    } else if (optionLower.includes('cambio') || optionLower.includes('reprogramar')) {
        await processClientResponse(phone, 'reprogramar');
    } else if (optionLower.includes('cancelar')) {
        await processClientResponse(phone, 'cancelar');
    } else {
        console.log(`[Evolution] Opción de poll no reconocida: ${selectedOption}`);
    }
}

/**
 * Procesa respuesta del cliente (texto o poll)
 */
async function processClientResponse(telefono, respuesta) {
    // Buscar cita activa
    const cita = await buscarCitaActiva(telefono);

    if (!cita) {
        console.log(`⚠️ No se encontró cita activa para ${telefono}`);
        return;
    }

    if (respuesta.includes('confirmo') || respuesta.includes('confirmar') || respuesta === '1') {
        await procesarConfirmacion(cita);
    } else if (respuesta.includes('reprogramar') || respuesta.includes('cambio') || respuesta === '2') {
        await procesarReprogramacion(cita);
    } else if (respuesta.includes('cancelar') || respuesta === '3') {
        await procesarCancelacion(cita);
    } else {
        console.log(`❓ Respuesta no reconocida: ${respuesta}`);
    }
}

/**
 * Busca la cita activa más reciente del cliente
 */
async function buscarCitaActiva(telefono) {
    try {
        let phone = telefono.replace(/\D/g, '');

        // Normalizar: si tiene 13 dígitos y empieza con 521, quitar el 1
        if (phone.length === 13 && phone.startsWith('521')) {
            phone = '52' + phone.substring(3);
        }
        if (phone.length === 10) {
            phone = '52' + phone;
        }

        console.log(`🔍 [Evolution] Buscando cita para: ${phone}`);

        const margin = new Date();
        margin.setHours(margin.getHours() - 2);
        const marginIso = margin.toISOString();

        // Buscar por teléfono exacto
        const snapshot = await firestore.collection('appointments')
            .where('clientPhone', '==', phone)
            .where('startDateTime', '>=', marginIso)
            .get();

        const validStatuses = ['scheduled', 'confirmed', 'rescheduling'];
        const filtered = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => validStatuses.includes(a.status))
            .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));

        if (filtered.length > 0) {
            console.log(`✅ Cita encontrada: ${filtered[0].id} - ${filtered[0].clientName}`);
            return filtered[0];
        }

        // Búsqueda por últimos 10 dígitos
        const last10 = phone.slice(-10);
        const altSnapshot = await firestore.collection('appointments')
            .where('startDateTime', '>=', marginIso)
            .get();

        for (const doc of altSnapshot.docs) {
            const data = doc.data();
            const dbPhone = (data.clientPhone || '').replace(/\D/g, '');

            if (dbPhone.endsWith(last10) && validStatuses.includes(data.status)) {
                console.log(`✅ Encontrado por coincidencia parcial: ${doc.id}`);
                return { id: doc.id, ...data };
            }
        }

        return null;
    } catch (error) {
        console.error('❌ Error buscando cita:', error);
        return null;
    }
}

/**
 * Procesa confirmación de cita
 */
async function procesarConfirmacion(cita) {
    console.log(`✅ Procesando confirmación para cita ${cita.id}`);
    try {
        await firestore.collection('appointments').doc(cita.id).update({
            status: 'confirmed',
            confirmedAt: new Date().toISOString(),
            confirmedVia: 'whatsapp-evolution'
        });

        await firestore.collection('notifications').add({
            type: 'cita',
            icon: 'calendar-check',
            title: 'Cita confirmada',
            message: `${cita.clientName} confirmó ${cita.serviceName}`,
            read: false,
            createdAt: new Date().toISOString(),
            entityId: cita.id
        });

        await WhatsAppService.sendConfirmacionRecibida(cita);
        console.log(`✅ Cita ${cita.id} confirmada exitosamente`);
    } catch (error) {
        console.error('Error procesando confirmación:', error);
    }
}

/**
 * Procesa solicitud de reprogramación
 */
async function procesarReprogramacion(cita) {
    console.log(`🔄 Procesando reprogramación para cita ${cita.id}`);
    try {
        await firestore.collection('appointments').doc(cita.id).update({
            status: 'rescheduling',
            rescheduleRequestedAt: new Date().toISOString()
        });

        await firestore.collection('notifications').add({
            type: 'alerta',
            icon: 'calendar-times',
            title: 'Solicitud de reprogramación',
            message: `${cita.clientName} quiere reprogramar ${cita.serviceName}`,
            read: false,
            createdAt: new Date().toISOString(),
            entityId: cita.id
        });

        await WhatsAppService.sendSolicitudReprogramacion(cita);
        console.log(`🔄 Solicitud de reprogramación enviada para cita ${cita.id}`);
    } catch (error) {
        console.error('Error procesando reprogramación:', error);
    }
}

/**
 * Procesa cancelación de cita
 */
async function procesarCancelacion(cita) {
    console.log(`❌ Procesando cancelación para cita ${cita.id}`);
    try {
        await firestore.collection('appointments').doc(cita.id).update({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledVia: 'whatsapp-evolution'
        });

        // Eliminar de Google Calendar
        try {
            const { deleteEvent } = await import('../services/googleCalendarService.js');
            const { config } = await import('../config/config.js');

            if (cita.googleCalendarEventId) {
                try {
                    await deleteEvent(cita.googleCalendarEventId, config.google.calendarOwner1);
                    console.log(`✅ Evento eliminado del calendar 1`);
                } catch (err) {
                    console.error(`❌ Error eliminando evento del calendar 1:`, err.message);
                }
            }
            if (cita.googleCalendarEventId2) {
                try {
                    await deleteEvent(cita.googleCalendarEventId2, config.google.calendarOwner2);
                    console.log(`✅ Evento eliminado del calendar 2`);
                } catch (err) {
                    console.error(`❌ Error eliminando evento del calendar 2:`, err.message);
                }
            }
        } catch (calErr) {
            console.error('⚠️ Error eliminando eventos del calendario:', calErr.message);
        }

        await firestore.collection('notifications').add({
            type: 'alerta',
            icon: 'calendar-times',
            title: 'Cita cancelada',
            message: `${cita.clientName} canceló ${cita.serviceName}`,
            read: false,
            createdAt: new Date().toISOString(),
            entityId: cita.id
        });

        await WhatsAppService.sendCancelacionConfirmada(cita);
        console.log(`❌ Cita ${cita.id} cancelada exitosamente`);
    } catch (error) {
        console.error('Error procesando cancelación:', error);
    }
}

export default router;

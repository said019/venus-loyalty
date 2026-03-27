// src/routes/whatsappWebhook.js - Webhook para respuestas de WhatsApp
import express from 'express';
import { firestore } from '../db/compat.js';
import { WhatsAppService } from '../services/whatsapp-v2.js';

const router = express.Router();

/**
 * Webhook para recibir mensajes de WhatsApp
 * POST /api/whatsapp/webhook
 */
router.post('/webhook', async (req, res) => {
    try {
        console.log('📥 Webhook recibido:', JSON.stringify(req.body, null, 2));

        const {
            From,           // whatsapp:+521234567890
            Body,           // Texto del mensaje o respuesta del botón
            ButtonText,     // Texto del botón presionado (si aplica)
            ButtonPayload,  // Payload del botón (si aplica)
            MessageSid
        } = req.body;

        const telefono = From?.replace('whatsapp:', '').replace('+', '') || '';

        console.log(`📩 Mensaje recibido de ${telefono}: ${Body || ButtonText}`);

        const respuesta = (ButtonText || Body || '').toLowerCase().trim();

        // Buscar cita activa del cliente
        const cita = await buscarCitaActiva(telefono);

        if (!cita) {
            console.log(`⚠️ No se encontró cita activa para ${telefono}`);
            // Responder al usuario que no se encontró cita (ayuda a debug y UX)
            const { WhatsAppService } = await import('../services/whatsapp.js');
            await WhatsAppService.sendWhatsAppText(telefono, 'Lo siento, no encontré ninguna cita próxima pendiente de confirmar para este número. Por favor verifica con administración.');
            return res.status(200).send('OK');
        }

        // Procesar respuesta
        if (respuesta.includes('confirmo') || respuesta === '1' || respuesta === 'confirmar') {
            await procesarConfirmacion(cita);
        }
        else if (respuesta.includes('reprogramar') || respuesta === '2') {
            await procesarReprogramacion(cita);
        }
        else if (respuesta.includes('cancelar') || respuesta === '3') {
            await procesarCancelacion(cita);
        }
        else {
            console.log(`❓ Respuesta no reconocida: ${respuesta}`);
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error('❌ Error en webhook WhatsApp:', error);
        res.status(500).send('Error');
    }
});

/**
 * Busca la cita activa más reciente del cliente
 */
async function buscarCitaActiva(telefono) {
    try {
        // Normalizar teléfono
        // A veces llega +521... para celulares de México
        // Base de datos suele tener 52...

        let phone = telefono.replace(/\D/g, '');

        // Si tiene 13 dígitos y empieza con 521, quitar el 1 (convertir a 52...)
        if (phone.length === 13 && phone.startsWith('521')) {
            phone = '52' + phone.substring(3);
        }
        // Si tiene 10 dígitos, agregar 52
        else if (phone.length === 10) {
            phone = '52' + phone;
        }

        console.log(`🔍 Buscando cita para teléfono normalizado: ${phone} (Original: ${telefono})`);

        const now = new Date().toISOString();

        // Buscar citas futuras del cliente (o recientes, ej. últimas 24h para permitir confirmar tarde)
        // Pero lo ideal es >= now.
        // Vamos a dar un margen de 2 horas atrás por si acaso.
        const margin = new Date();
        margin.setHours(margin.getHours() - 2);
        const marginIso = margin.toISOString();

        console.log(`📅 Buscando citas desde: ${marginIso}`);

        // Buscar por teléfono exacto primero
        const snapshot = await firestore.collection('appointments')
            .where('clientPhone', '==', phone)
            .where('startDateTime', '>=', marginIso)
            .get();

        console.log(`📦 Citas encontradas por teléfono exacto (${phone}): ${snapshot.size}`);

        // Filtrar por status en código (más seguro que 'in' para compatibilidad)
        const validStatuses = ['scheduled', 'confirmed', 'rescheduling'];
        const filtered = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => validStatuses.includes(a.status))
            .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));

        console.log(`✅ Citas con status válido: ${filtered.length}`);
        if (filtered.length > 0) {
            console.log(`✅ Usando cita: ${filtered[0].id} - ${filtered[0].clientName} - ${filtered[0].serviceName}`);
            return filtered[0];
        }

        // Búsqueda alternativa por últimos 10 dígitos (más robusta)
        const last10 = phone.slice(-10);
        console.log(`⚠️ No encontrado exacto. Buscando por terminación: ...${last10}`);

        const altSnapshot = await firestore.collection('appointments')
            .where('startDateTime', '>=', marginIso)
            .get();

        console.log(`📦 Citas totales desde ${marginIso}: ${altSnapshot.size}`);

        for (const doc of altSnapshot.docs) {
            const data = doc.data();
            const dbPhone = (data.clientPhone || '').replace(/\D/g, '');

            if (dbPhone.endsWith(last10) && validStatuses.includes(data.status)) {
                console.log(`✅ Encontrado por coincidencia parcial: ${doc.id} - Tel DB: ${dbPhone}`);
                return { id: doc.id, ...data };
            }
        }

        console.log('❌ No se encontró ninguna cita activa');
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
    console.log(`✅ Procesando confirmación para cita ${cita.id} (status actual: ${cita.status})`);

    // Si ya está confirmada, no re-enviar el mensaje
    if (cita.status === 'confirmed') {
        console.log(`⏭️ Cita ${cita.id} ya estaba confirmada, no se re-envía mensaje`);
        return;
    }

    try {
        await firestore.collection('appointments').doc(cita.id).update({
            status: 'confirmed',
            confirmedAt: new Date().toISOString(),
            confirmedVia: 'whatsapp'
        });

        // Crear notificación
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

        // Crear notificación
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
        // 1. Cancelar en Firestore
        await firestore.collection('appointments').doc(cita.id).update({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledVia: 'whatsapp'
        });

        // 2. Eliminar de Google Calendar si hay eventIds
        try {
            const { deleteEvent } = await import('../services/googleCalendarService.js');
            const { config } = await import('../config/config.js');

            // Eliminar evento 1 si existe
            if (cita.googleCalendarEventId) {
                try {
                    await deleteEvent(cita.googleCalendarEventId, config.google.calendarOwner1);
                    console.log(`✅ Evento eliminado del calendar 1: ${cita.googleCalendarEventId}`);
                } catch (err) {
                    console.error(`❌ Error eliminando evento del calendar 1:`, err.message);
                }
            }

            // Eliminar evento 2 si existe
            if (cita.googleCalendarEventId2) {
                try {
                    await deleteEvent(cita.googleCalendarEventId2, config.google.calendarOwner2);
                    console.log(`✅ Evento eliminado del calendar 2: ${cita.googleCalendarEventId2}`);
                } catch (err) {
                    console.error(`❌ Error eliminando evento del calendar 2:`, err.message);
                }
            }
        } catch (calErr) {
            console.error('⚠️ Error eliminando eventos del calendario:', calErr.message);
            // Continuar de todos modos - la cita ya está cancelada en Firestore
        }

        // 3. Crear notificación
        await firestore.collection('notifications').add({
            type: 'alerta',
            icon: 'calendar-times',
            title: 'Cita cancelada',
            message: `${cita.clientName} canceló ${cita.serviceName}`,
            read: false,
            createdAt: new Date().toISOString(),
            entityId: cita.id
        });

        // 4. Enviar confirmación por WhatsApp
        await WhatsAppService.sendCancelacionConfirmada(cita);

        console.log(`❌ Cita ${cita.id} cancelada exitosamente (Firestore + Google Calendar)`);

    } catch (error) {
        console.error('Error procesando cancelación:', error);
    }
}

export default router;

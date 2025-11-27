// src/routes/whatsappWebhook.js - Webhook para respuestas de WhatsApp (Twilio)
import express from 'express';
import { firestore } from '../../lib/firebase.js';
import { WhatsAppService } from '../services/whatsapp.js';

const router = express.Router();

/**
 * Webhook para recibir mensajes de WhatsApp (Twilio)
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
        let phone = telefono.replace(/\D/g, '');
        if (phone.length === 10) phone = '52' + phone;

        const now = new Date().toISOString();

        // Buscar citas futuras del cliente
        const snapshot = await firestore.collection('appointments')
            .where('clientPhone', '==', phone)
            .where('status', 'in', ['scheduled', 'confirmed'])
            .orderBy('startDateTime', 'asc')
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        }

        // Búsqueda alternativa por últimos 10 dígitos
        const altSnapshot = await firestore.collection('appointments')
            .where('status', 'in', ['scheduled', 'confirmed'])
            .orderBy('startDateTime', 'asc')
            .limit(50)
            .get();

        for (const doc of altSnapshot.docs) {
            const data = doc.data();
            const tel = (data.clientPhone || '').replace(/\D/g, '');
            
            if (tel.endsWith(phone.slice(-10))) {
                return { id: doc.id, ...data };
            }
        }

        return null;

    } catch (error) {
        console.error('Error buscando cita:', error);
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
            confirmedVia: 'whatsapp'
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
            cancelledVia: 'whatsapp'
        });

        await WhatsAppService.sendCancelacionConfirmada(cita);

        console.log(`❌ Cita ${cita.id} cancelada exitosamente`);

    } catch (error) {
        console.error('Error procesando cancelación:', error);
    }
}

export default router;

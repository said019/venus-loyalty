// src/services/whatsapp-v2.js - Sistema de notificaciones WhatsApp (Evolution API)
import { config } from '../config/config.js';
import { getEvolutionClient } from './whatsapp-evolution.js';
import { firestore } from '../db/compat.js';
import { formatearFechaLegible, formatearHora } from '../utils/mexico-time.js';

/**
 * Sanitiza texto para WhatsApp
 * Reemplaza caracteres especiales que causan problemas
 */
function sanitizeForWhatsApp(text) {
    if (!text) return '';
    return text
        .replace(/\+/g, 'y')           // + -> y
        .replace(/&/g, 'y')            // & -> y
        .replace(/</g, '')             // Eliminar <
        .replace(/>/g, '')             // Eliminar >
        .replace(/\n/g, ' ')           // Saltos de línea -> espacio
        .replace(/\r/g, '')            // Eliminar retorno de carro
        .replace(/[\u0000-\u001F]/g, '') // Eliminar caracteres de control
        .trim();
}

/**
 * Envía un mensaje usando Evolution API (texto libre, sin templates)
 */
async function sendViaEvolution(to, message) {
    try {
        const evoClient = getEvolutionClient();
        const result = await evoClient.sendText(to, message);
        console.log(`✅ [Evolution] WhatsApp enviado a ${to}`);
        return { success: true, messageSid: result?.key?.id || 'evolution-sent' };
    } catch (error) {
        console.error('❌ [Evolution] Error enviando WhatsApp:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Envía un Poll usando Evolution API (funciona en iOS y Android)
 */
async function sendPollViaEvolution(to, question, options, appointmentId = null) {
    try {
        const evoClient = getEvolutionClient();
        let pollResult;

        // Si la pregunta es muy larga (>256 chars), enviar texto primero y poll corto después
        if (question.length > 200) {
            console.log(`[Evolution] Pregunta larga (${question.length} chars), enviando texto + poll separados`);
            // Enviar el mensaje completo como texto
            await evoClient.sendText(to, question);
            // Pequeña pausa para que llegue en orden
            await new Promise(r => setTimeout(r, 1000));
            // Enviar poll corto
            pollResult = await evoClient.sendPoll(to, '¿Qué deseas hacer?', options, 1);
            console.log(`✅ [Evolution] Texto + Poll enviado a ${to}`);
        } else {
            console.log(`[Evolution] Enviando poll a ${to}, pregunta: ${question.length} chars, opciones: ${options.length}`);
            pollResult = await evoClient.sendPoll(to, question, options, 1);
            console.log(`✅ [Evolution] Poll enviado a ${to}`);
        }

        // Guardar mapeo pollMessageId → appointmentId para identificar cita exacta en webhook
        const pollMsgId = pollResult?.key?.id;
        if (pollMsgId && appointmentId) {
            try {
                await firestore.collection('pending_polls').doc(pollMsgId).set({
                    appointmentId,
                    phone: to,
                    createdAt: new Date().toISOString(),
                    // Expirar en 48h (limpieza eventual)
                    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
                });
                console.log(`✅ [Evolution] Mapeo poll ${pollMsgId} → cita ${appointmentId} guardado`);
            } catch (fsErr) {
                console.warn('[Evolution] No se pudo guardar mapeo poll→cita:', fsErr.message);
            }
        }

        return { success: true, messageSid: pollMsgId || 'evolution-poll-sent' };
    } catch (error) {
        const responseData = error.response?.data;
        console.error('❌ [Evolution] Error enviando Poll:', error.message, 'Response:', JSON.stringify(responseData));
        return { success: false, error: error.message };
    }
}

function buildAttendanceSurveyCopy(appt) {
    const fecha = formatearFechaLegible(appt.date || appt.startDateTime);
    const hora = appt.time || formatearHora(appt.startDateTime);
    const nombre = sanitizeForWhatsApp(appt.clientName);
    const servicio = sanitizeForWhatsApp(appt.serviceName);

    return {
        question: `Hola ${nombre}, ¿nos confirmas tu asistencia para ${servicio} el ${fecha} a las ${hora}?`,
        message: `Hola ${nombre} 👋\n\nQueremos confirmar tu asistencia a *${servicio}* el *${fecha}* a las *${hora}*.\n\nResponde con una opción:\n1. Confirmar asistencia\n2. Reagendar\n3. Cancelar\n\nGracias por elegir Venus Cosmetología.`
    };
}

export const WhatsAppService = {
    /** Envía confirmación de cita al momento de crearla */
    async sendConfirmation(appt) {
        console.log('[WHATSAPP] sendConfirmation llamado con:', {
            hasTime: !!appt.time,
            time: appt.time,
            hasStartDateTime: !!appt.startDateTime
        });

        let hora;
        if (appt.time) {
            hora = appt.time;
        } else if (appt.startDateTime) {
            hora = formatearHora(appt.startDateTime);
        } else {
            hora = '00:00';
        }

        const fecha = appt.date ? formatearFechaLegible(appt.date) : formatearFechaLegible(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        const mensaje = `📅 *Cita Confirmada*\n\nHola ${nombre}, tu cita ha sido agendada:\n\n🔹 *Servicio:* ${servicio}\n📆 *Fecha:* ${fecha}\n🕐 *Hora:* ${hora}\n📍 *Lugar:* ${config.venus.location}\n\n¡Te esperamos! ✨`;
        return await sendViaEvolution(appt.clientPhone, mensaje);
    },

    /** Envía recordatorio 24 horas antes con encuesta de confirmación */
    async sendReminder24h(appt) {
        return await this.sendAttendanceSurvey(appt);
    },

    /** Envía indicaciones de depilación láser 48 horas antes de la cita */
    async sendReminderDepilacion48h(appt) {
        const fecha = formatearFechaLegible(appt.date || appt.startDateTime);
        const hora = appt.time || formatearHora(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        const mensaje =
`Hola ${nombre} 👋 Te recordamos que tienes una cita de *${servicio}* el *${fecha}* a las *${hora}*.

🌿 *Indicaciones Antes de tu Sesión de Depilación Láser:*
• Rasura el área a tratar 24 horas antes de tu cita.
• Evita la exposición solar directa y el uso de autobronceadores al menos 72 horas antes.
• No uses cremas, aceites, desodorantes o maquillaje el día de la sesión.
• Suspende exfoliaciones o tratamientos irritantes una semana antes.
• Si estás tomando antibióticos o tienes alguna condición médica, coméntalo antes de la sesión.

─────────────────────

💫 *Cuidados Después de la Sesión:*
• Evita exponerte al sol o calor intenso (vapor, saunas, ejercicio intenso) durante 48 horas.
• No rasques ni frotes la piel tratada.
• Aplica gel de aloe vera o crema calmante para hidratar y aliviar la zona.
• No uses productos con alcohol o fragancias por al menos 24 horas.
• Usa protector solar FPS 50 si la zona estará expuesta.

¡Te esperamos! 🌸`;

        return await sendViaEvolution(appt.clientPhone, mensaje);
    },

    /** Envía recordatorio 30 horas antes (depilación / servicios largos) */
    async sendReminder30h(appt) {
        const fecha = formatearFechaLegible(appt.date || appt.startDateTime);
        const hora = appt.time || formatearHora(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        const mensaje = `⏰ *Recordatorio de tu cita mañana*\n\nHola ${nombre} 👋\n\n🔹 *Servicio:* ${servicio}\n📆 *Fecha:* ${fecha}\n🕐 *Hora:* ${hora}\n📍 *Lugar:* ${config.venus.location}\n\n⚠️ Recuerda llegar 5 minutos antes. Si necesitas reagendar, avísanos con tiempo.\n\n¡Te esperamos! ✨`;
        return await sendViaEvolution(appt.clientPhone, mensaje);
    },

    /** Envía alerta de cancelación automática (4h antes si no ha confirmado) */
    async sendAlertaCancelacion(appt) {
        const fecha = formatearFechaLegible(appt.date || appt.startDateTime);
        const hora = appt.time || formatearHora(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        const mensaje = `⚠️ *Confirmación pendiente*\n\nHola ${nombre}, tu cita de *${servicio}* para el ${fecha} a las ${hora} aún no ha sido confirmada.\n\n🕐 *Si no confirmas en la próxima hora, la cita será cancelada automáticamente.*\n\nResponde *CONFIRMO* para confirmar tu asistencia.\n\nSi deseas cancelar o reagendar, avísanos. 🌸`;
        return await sendViaEvolution(appt.clientPhone, mensaje);
    },

    /** Envía recordatorio 2 horas antes */
    async sendReminder2h(appt) {
        const hora = appt.time || formatearHora(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        const mensaje = `🔔 *Tu cita es en 2 horas*\n\nHola ${nombre} 👋\n\n🔹 *Servicio:* ${servicio}\n🕐 *Hora:* ${hora}\n📍 *Lugar:* ${config.venus.location}\n\n⚠️ Recuerda llegar 5 minutos antes.\n\n¡Te esperamos! ✨`;
        return await sendViaEvolution(appt.clientPhone, mensaje);
    },

    async sendAttendanceSurvey(appt) {
        const { question, message } = buildAttendanceSurveyCopy(appt);

        // Intentar poll primero (mejor UX)
        try {
            const result = await sendPollViaEvolution(
                appt.clientPhone,
                question,
                ['Confirmar asistencia', 'Reagendar', 'Cancelar'],
                appt.id
            );
            if (result.success) {
                return { ...result, delivery: 'poll', manualMessage: message };
            }
        } catch (error) {
            console.warn('[WhatsApp] Evolution error en encuesta de asistencia:', error.message);
        }

        // Fallback: texto libre
        const result = await sendViaEvolution(appt.clientPhone, message);
        return {
            ...result,
            delivery: result.success ? 'text' : 'manual',
            manualMessage: message
        };
    },

    /** Envía confirmación cuando el cliente confirma su cita */
    async sendConfirmacionRecibida(appt) {
        const fecha = formatearFechaLegible(appt.date || appt.startDateTime);
        const hora = appt.time || formatearHora(appt.startDateTime);

        const mensaje = `✅ ¡Gracias ${appt.clientName}! Tu cita ha sido confirmada para el ${fecha} a las ${hora}. Te esperamos en Venus Cosmetología.`;
        return await sendViaEvolution(appt.clientPhone, mensaje);
    },

    async sendSolicitudReprogramacion(appt) {
        const mensaje = `🔄 Entendido ${appt.clientName}. Nos pondremos en contacto contigo pronto para reprogramar tu cita.`;
        return await sendViaEvolution(appt.clientPhone, mensaje);
    },

    async sendCancelacionConfirmada(appt) {
        const mensaje = `❌ Tu cita ha sido cancelada exitosamente. Esperamos verte pronto de nuevo.`;
        return await sendViaEvolution(appt.clientPhone, mensaje);
    },

    // Helpers exportados
    buildAttendanceSurveyMessage(appt) {
        return buildAttendanceSurveyCopy(appt).message;
    },
    formatearFechaLegible,
    formatearHora
};

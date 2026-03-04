// src/services/whatsapp-v2.js - Sistema de notificaciones WhatsApp (Twilio + Evolution API)
import twilio from 'twilio';
import { config } from '../config/config.js';
import { getEvolutionClient } from './whatsapp-evolution.js';
import { firestore } from '../db/compat.js';
import { formatearFechaLegible, formatearHora } from '../utils/mexico-time.js';

// Cliente de Twilio
let client = null;

function getTwilioClient() {
    if (!client && config.twilio.accountSid && config.twilio.authToken) {
        client = twilio(config.twilio.accountSid, config.twilio.authToken);
    }
    return client;
}

const IS_EVOLUTION = config.whatsappProvider === 'evolution';

/**
 * Envía un mensaje de WhatsApp usando un Content Template de Twilio
 */
async function sendWhatsAppTemplate(to, templateSid, variables) {
    const twilioClient = getTwilioClient();

    if (!twilioClient) {
        console.warn('⚠️ WhatsApp: Twilio no configurado. Saltando envío.');
        return { success: false, error: 'Twilio no configurado' };
    }

    try {
        // Normalizar teléfono (agregar prefijo si es necesario)
        let phone = to.replace(/\D/g, '');
        if (phone.length === 10) phone = '52' + phone;
        if (!phone.startsWith('52')) phone = '52' + phone;

        const messageParams = {
            from: config.twilio.whatsappNumber,
            to: `whatsapp:+${phone}`,
            contentSid: templateSid,
            contentVariables: JSON.stringify(variables)
        };

        console.log('📤 Enviando WhatsApp con parámetros:', {
            from: messageParams.from,
            to: messageParams.to,
            contentSid: messageParams.contentSid,
            variables: variables
        });

        const message = await twilioClient.messages.create(messageParams);

        console.log(`✅ WhatsApp enviado a +${phone}: ${message.sid}`);
        return { success: true, messageSid: message.sid };
    } catch (error) {
        console.error('❌ Error enviando WhatsApp:', error.message);
        if (error.code) console.error('   Código de error:', error.code);
        if (error.moreInfo) console.error('   Más info:', error.moreInfo);
        return { success: false, error: error.message };
    }
}

// formatearFechaLegible y formatearHora importados de ../utils/mexico-time.js

/**
 * Sanitiza texto para evitar error 63021 de WhatsApp
 * Reemplaza caracteres especiales que causan problemas en templates
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
 * Envía un mensaje de texto libre (solo funciona si hay sesión activa de 24h)
 */
async function sendWhatsAppText(to, body) {
    const twilioClient = getTwilioClient();

    if (!twilioClient) {
        console.warn('⚠️ WhatsApp: Twilio no configurado. Saltando envío.');
        return { success: false, error: 'Twilio no configurado' };
    }

    try {
        // Normalizar teléfono
        let phone = to.replace(/\D/g, '');
        if (phone.length === 10) phone = '52' + phone;
        if (!phone.startsWith('52')) phone = '52' + phone;

        const messageParams = {
            from: config.twilio.whatsappNumber,
            to: `whatsapp:+${phone}`,
            body: body
        };

        console.log('📤 Enviando mensaje de texto WhatsApp:', {
            to: messageParams.to,
            body: body
        });

        const message = await twilioClient.messages.create(messageParams);

        console.log(`✅ WhatsApp texto enviado a +${phone}: ${message.sid}`);
        return { success: true, messageSid: message.sid };
    } catch (error) {
        console.error('❌ Error enviando WhatsApp texto:', error.message);
        return { success: false, error: error.message };
    }
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

export const WhatsAppService = {
    /**
     * Envía confirmación de cita al momento de crearla
     * Template: confirmacion_cita
     * Variables: {{1}}=Nombre, {{2}}=Servicio, {{3}}=Fecha, {{4}}=Hora, {{5}}=Lugar
     */
    async sendConfirmation(appt) {
        // VERSION: TIMEZONE-FIX-FINAL
        // SIEMPRE usar appt.time si está disponible (es el campo más confiable)
        console.log('[WHATSAPP] 🔥 VERSION: EVOLUTION-SWITCH 🔥');
        console.log('[WHATSAPP] sendConfirmation llamado con:', {
            hasTime: !!appt.time,
            time: appt.time,
            hasStartDateTime: !!appt.startDateTime,
            provider: config.whatsappProvider
        });

        let hora;
        if (appt.time) {
            // Si time existe, usarlo directamente (formato HH:MM) - SIN CONVERSIÓN
            hora = appt.time;
            console.log('[WHATSAPP] ✅✅✅ Usando appt.time DIRECTAMENTE SIN CONVERSIÓN:', hora);
        } else if (appt.startDateTime) {
            console.log('[WHATSAPP] No hay appt.time, convirtiendo startDateTime:', appt.startDateTime);
            // Usar formatearHora del helper México (maneja Date y strings ISO correctamente)
            hora = formatearHora(appt.startDateTime);
            console.log('[WHATSAPP] Convertido con helper México:', hora);
        } else {
            hora = '00:00'; // Fallback de emergencia
        }

        const fecha = appt.date ? formatearFechaLegible(appt.date) : formatearFechaLegible(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        console.log('[WHATSAPP] sendConfirmation FINAL:', {
            clientName: nombre,
            fecha,
            hora,
            apptTimeOriginal: appt.time,
            startDateTime: appt.startDateTime
        });

        // === EVOLUTION API (siempre intentar primero si está configurada) ===
        const hasEvolution = !!(config.evolution?.apiUrl && config.evolution?.apiKey);
        if (hasEvolution) {
            try {
                const mensaje = `📅 *Cita Confirmada*\n\nHola ${nombre}, tu cita ha sido agendada:\n\n🔹 *Servicio:* ${servicio}\n📆 *Fecha:* ${fecha}\n🕐 *Hora:* ${hora}\n📍 *Lugar:* ${config.venus.location}\n\n¡Te esperamos! ✨`;
                const result = await sendViaEvolution(appt.clientPhone, mensaje);
                if (result.success) return result;
                console.warn('[WhatsApp] Evolution falló para confirmación, intentando Twilio:', result.error);
            } catch (evoErr) {
                console.warn('[WhatsApp] Evolution error en confirmación:', evoErr.message);
            }
        }

        // === TWILIO (fallback con template) ===
        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.CONFIRMACION_CITA,
            {
                '1': nombre,
                '2': servicio,
                '3': fecha,
                '4': hora,
                '5': config.venus.location
            }
        );
    },

    /**
     * Envía recordatorio 24 horas antes
     * Template: recordatorio_24h
     * Variables: {{1}}=Nombre, {{2}}=Servicio, {{3}}=Fecha, {{4}}=Hora
     */
    async sendReminder24h(appt) {
        const fecha = formatearFechaLegible(appt.date || appt.startDateTime);
        const hora = appt.time || formatearHora(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        // ✅ Recordatorio automático del cron → siempre Twilio template
        // El poll interactivo (confirmar/cancelar/reagendar) solo se manda
        // cuando el admin presiona el botón manual en la cita (sendReminderWithOptions)
        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.RECORDATORIO_24H,
            {
                '1': nombre,
                '2': servicio,
                '3': fecha,
                '4': hora
            }
        );
    },

    /**
     * Envía recordatorio 2 horas antes
     * Template: recordatorio_2h
     * Variables: {{1}}=Nombre, {{2}}=Servicio, {{3}}=Hora
     */
    async sendReminder2h(appt) {
        const hora = appt.time || formatearHora(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        // ✅ Recordatorio automático del cron → siempre Twilio template
        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.RECORDATORIO_2H,
            {
                '1': nombre,
                '2': servicio,
                '3': hora
            }
        );
    },

    /**
     * Envía confirmación cuando el cliente confirma su cita
     * USA TEXTO LIBRE (Respuesta a sesión activa)
     */
    async sendConfirmacionRecibida(appt) {
        const fecha = formatearFechaLegible(appt.date || appt.startDateTime);
        const hora = appt.time || formatearHora(appt.startDateTime);

        const mensaje = `✅ ¡Gracias ${appt.clientName}! Tu cita ha sido confirmada para el ${fecha} a las ${hora}. Te esperamos en Venus Cosmetología.`;

        // Siempre intentar Evolution primero
        const hasEvolution = !!(config.evolution?.apiUrl && config.evolution?.apiKey);
        if (hasEvolution) {
            try {
                const result = await sendViaEvolution(appt.clientPhone, mensaje);
                if (result.success) return result;
            } catch (e) { /* fall through to Twilio */ }
        }
        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    /**
     * Envía mensaje de solicitud de reprogramación
     * USA TEXTO LIBRE (Respuesta a sesión activa)
     */
    async sendSolicitudReprogramacion(appt) {
        const mensaje = `🔄 Entendido ${appt.clientName}. Nos pondremos en contacto contigo pronto para reprogramar tu cita.`;
        
        // Siempre intentar Evolution primero
        const hasEvolution = !!(config.evolution?.apiUrl && config.evolution?.apiKey);
        if (hasEvolution) {
            try {
                const result = await sendViaEvolution(appt.clientPhone, mensaje);
                if (result.success) return result;
            } catch (e) { /* fall through to Twilio */ }
        }
        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    /**
     * Envía confirmación de cancelación
     * USA TEXTO LIBRE (Respuesta a sesión activa)
     */
    async sendCancelacionConfirmada(appt) {
        const mensaje = `❌ Tu cita ha sido cancelada exitosamente. Esperamos verte pronto de nuevo.`;
        
        // Siempre intentar Evolution primero
        const hasEvolution = !!(config.evolution?.apiUrl && config.evolution?.apiKey);
        if (hasEvolution) {
            try {
                const result = await sendViaEvolution(appt.clientPhone, mensaje);
                if (result.success) return result;
            } catch (e) { /* fall through to Twilio */ }
        }
        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    // Helpers exportados
    formatearFechaLegible,
    formatearHora
};

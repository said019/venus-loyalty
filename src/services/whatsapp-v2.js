// src/services/whatsapp-v2.js - Sistema de notificaciones WhatsApp (Twilio + Evolution API)
import twilio from 'twilio';
import { config } from '../config/config.js';
import { getEvolutionClient } from './whatsapp-evolution.js';

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

/**
 * Formatea fecha para mostrar de forma legible
 * Usa timezone local para evitar problemas con UTC
 */
function formatearFechaLegible(fecha) {
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    let date;
    if (typeof fecha === 'string' && fecha.includes('T')) {
        // Si viene con hora ISO, parsearlo correctamente
        date = new Date(fecha);
    } else if (typeof fecha === 'string' && fecha.includes('-')) {
        // Si es YYYY-MM-DD, crear fecha en timezone local (no UTC)
        const [year, month, day] = fecha.split('-').map(Number);
        date = new Date(year, month - 1, day, 12, 0, 0); // Usar mediodía para evitar problemas de timezone
    } else {
        date = new Date(fecha);
    }

    return `${date.getDate()} de ${meses[date.getMonth()]}`;
}

/**
 * Formatea hora para mostrar
 * Maneja objetos Date de Prisma (UTC) y strings ISO
 */
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

function formatearHora(dateTimeStr) {
    // Si viene el campo 'time' directamente (HH:MM), usarlo
    if (typeof dateTimeStr === 'string' && /^\d{2}:\d{2}$/.test(dateTimeStr)) {
        return dateTimeStr;
    }

    // Si es un objeto Date de Prisma
    if (dateTimeStr instanceof Date) {
        // Prisma devuelve fechas en UTC, convertir a hora de México
        // México es UTC-6
        const utcHours = dateTimeStr.getUTCHours();
        const utcMinutes = dateTimeStr.getUTCMinutes();

        // Ajustar a hora de México (UTC-6)
        let mexicoHours = utcHours - 6;
        if (mexicoHours < 0) mexicoHours += 24;

        return `${mexicoHours.toString().padStart(2, '0')}:${utcMinutes.toString().padStart(2, '0')}`;
    }

    // Si es un string ISO con offset de México (ej: 2025-01-01T10:30:00-06:00)
    if (typeof dateTimeStr === 'string' && dateTimeStr.includes('T')) {
        // Extraer la hora directamente del string si tiene offset -06:00
        if (dateTimeStr.includes('-06:00') || dateTimeStr.includes('-6:00')) {
            const timePart = dateTimeStr.split('T')[1];
            const hourMinute = timePart.substring(0, 5); // "10:30"
            return hourMinute;
        }

        // Si es UTC (termina en Z) o tiene otro offset, convertir
        const date = new Date(dateTimeStr);
        const utcHours = date.getUTCHours();
        const utcMinutes = date.getUTCMinutes();
        let mexicoHours = utcHours - 6;
        if (mexicoHours < 0) mexicoHours += 24;

        return `${mexicoHours.toString().padStart(2, '0')}:${utcMinutes.toString().padStart(2, '0')}`;
    }

    return '00:00';
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

        // Guardar en Firestore para historial
        try {
            const { firestore } = await import('../db/compat.js');
            let phone = String(to).replace(/\D/g, '');
            if (phone.length === 13 && phone.startsWith('521')) phone = '52' + phone.substring(3);
            if (phone.length === 10) phone = '52' + phone;
            await firestore.collection('whatsapp_messages').add({
                phone,
                name: 'Venus Cosmetología',
                body: message,
                direction: 'out',
                timestamp: new Date().toISOString(),
                read: true,
                messageId: result?.key?.id || null,
            });
        } catch (saveErr) {
            console.error('[Evolution] Error guardando mensaje enviado:', saveErr.message);
        }

        return { success: true, messageSid: result?.key?.id || 'evolution-sent' };
    } catch (error) {
        console.error('❌ [Evolution] Error enviando WhatsApp:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Envía mensaje directo desde la bandeja del admin (sin guardar doble)
 */
export async function sendViaEvolutionRaw(to, message) {
    try {
        const evoClient = getEvolutionClient();
        const result = await evoClient.sendText(to, message);

        // Guardar en Firestore
        const { firestore } = await import('../db/compat.js');
        let phone = String(to).replace(/\D/g, '');
        if (phone.length === 13 && phone.startsWith('521')) phone = '52' + phone.substring(3);
        if (phone.length === 10) phone = '52' + phone;
        await firestore.collection('whatsapp_messages').add({
            phone,
            name: 'Venus Cosmetología',
            body: message,
            direction: 'out',
            timestamp: new Date().toISOString(),
            read: true,
            messageId: result?.key?.id || null,
        });

        return { success: true, messageSid: result?.key?.id || 'evolution-sent' };
    } catch (error) {
        console.error('❌ [Evolution] Error enviando WhatsApp:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Envía un Poll usando Evolution API (funciona en iOS y Android)
 */
async function sendPollViaEvolution(to, question, options) {
    try {
        const evoClient = getEvolutionClient();
        const result = await evoClient.sendPoll(to, question, options, 1);
        console.log(`✅ [Evolution] Poll enviado a ${to}`);
        return { success: true, messageSid: result?.key?.id || 'evolution-poll-sent' };
    } catch (error) {
        console.error('❌ [Evolution] Error enviando Poll:', error.message);
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
            // Si startDateTime es un Date object, extraer hora de México
            if (appt.startDateTime instanceof Date) {
                // Convertir manualmente UTC a México (UTC-6)
                const utcHours = appt.startDateTime.getUTCHours();
                const utcMinutes = appt.startDateTime.getUTCMinutes();
                let mexicoHours = utcHours - 6;
                if (mexicoHours < 0) mexicoHours += 24;

                hora = `${mexicoHours.toString().padStart(2, '0')}:${utcMinutes.toString().padStart(2, '0')}`;
                console.log('[WHATSAPP] Convertido de UTC a México:', {
                    utcHours, utcMinutes, mexicoHours, hora
                });
            } else {
                hora = formatearHora(appt.startDateTime);
            }
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

        // === EVOLUTION API ===
        if (IS_EVOLUTION) {
            const mensaje = `📅 *Cita Confirmada*\n\nHola ${nombre}, tu cita ha sido agendada:\n\n🔹 *Servicio:* ${servicio}\n📆 *Fecha:* ${fecha}\n🕐 *Hora:* ${hora}\n📍 *Lugar:* ${config.venus.location}\n\n¡Te esperamos! ✨`;
            return await sendViaEvolution(appt.clientPhone, mensaje);
        }

        // === TWILIO ===
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
     * Envía notificación de reagendamiento (cita modificada por el admin)
     */
    async sendReschedule(appt) {
        const fecha = appt.date ? formatearFechaLegible(appt.date) : formatearFechaLegible(appt.startDateTime);
        const hora = appt.time || formatearHora(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        // === EVOLUTION API ===
        if (IS_EVOLUTION) {
            const mensaje = `🔄 *Cita Reagendada*\n\nHola ${nombre}, tu cita ha sido modificada:\n\n🔹 *Servicio:* ${servicio}\n📆 *Nueva Fecha:* ${fecha}\n🕐 *Nueva Hora:* ${hora}\n📍 *Lugar:* ${config.venus.location}\n\n¡Te esperamos! ✨`;
            return await sendViaEvolution(appt.clientPhone, mensaje);
        }

        // === TWILIO (usa mismo template que confirmación) ===
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
     * Envía recordatorio 30 horas antes (Específico para depilación)
     */
    async sendReminder30h(appt) {
        const nombre = sanitizeForWhatsApp(appt.clientName);

        // === EVOLUTION API ===
        if (IS_EVOLUTION) {
            const mensaje = `🌿 *Indicaciones Antes de tu Sesión de Depilación Láser:*\n\nHola ${nombre},\n\n• Rasura el área a tratar 24 horas antes de tu cita.\n• Evita la exposición solar directa y el uso de autobronceadores al menos 72 horas antes.\n• No uses cremas, aceites, desodorantes o maquillaje el día de la sesión.\n• Suspende exfoliaciones o tratamientos irritantes una semana antes.\n• Si estás tomando antibióticos o tienes alguna condición médica, coméntalo antes de la sesión.\n\n⸻\n\n💫 *Cuidados Después de la Sesión:*\n\n• Evita exponerte al sol o calor intenso (vapor, saunas, ejercicio intenso) durante 48 horas.\n• No rasques ni frotes la piel tratada.\n• Aplica gel de aloe vera o crema calmante para hidratar y aliviar la zona.\n• No uses productos con alcohol o fragancias por al menos 24 horas.\n• Usa protector solar FPS 50 si la zona estará expuesta.`;
            return await sendViaEvolution(appt.clientPhone, mensaje);
        }

        // Si no es Evolution, no enviamos nada por ahora o podríamos usar Twilio si hubiera template
        console.warn('⚠️ WhatsApp: Recordatorio 30h solo soportado en Evolution API.');
        return { success: false, error: 'Solo soportado en Evolution API' };
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

        // === EVOLUTION API (con Poll para confirmar) ===
        if (IS_EVOLUTION) {
            const question = `⏰ *Recordatorio de Cita*\n\nHola ${nombre}, te recordamos tu cita de mañana:\n\n🔹 *Servicio:* ${servicio}\n📆 *Fecha:* ${fecha}\n🕐 *Hora:* ${hora}\n\n¿Qué deseas hacer?`;
            return await sendPollViaEvolution(appt.clientPhone, question, [
                '✅ Confirmar Asistencia',
                '🔄 Solicitar Cambio de Horario',
                '❌ Cancelar Cita'
            ]);
        }

        // === TWILIO ===
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

        // === EVOLUTION API ===
        if (IS_EVOLUTION) {
            const mensaje = `🔔 *¡Tu cita es en 2 horas!*\n\nHola ${nombre}, tu cita de ${servicio} es a las ${hora}.\n\n📍 ${config.venus.location}\n\n¡Te esperamos! ✨`;
            return await sendViaEvolution(appt.clientPhone, mensaje);
        }

        // === TWILIO ===
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

        if (IS_EVOLUTION) {
            return await sendViaEvolution(appt.clientPhone, mensaje);
        }
        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    /**
     * Envía mensaje de solicitud de reprogramación
     * USA TEXTO LIBRE (Respuesta a sesión activa)
     */
    async sendSolicitudReprogramacion(appt) {
        const mensaje = `🔄 Entendido ${appt.clientName}. Nos pondremos en contacto contigo pronto para reprogramar tu cita.`;
        if (IS_EVOLUTION) {
            return await sendViaEvolution(appt.clientPhone, mensaje);
        }
        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    /**
     * Envía confirmación de cancelación
     * USA TEXTO LIBRE (Respuesta a sesión activa)
     */
    async sendCancelacionConfirmada(appt) {
        const mensaje = `❌ Tu cita ha sido cancelada exitosamente. Esperamos verte pronto de nuevo.`;
        if (IS_EVOLUTION) {
            return await sendViaEvolution(appt.clientPhone, mensaje);
        }
        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    // Helpers exportados
    formatearFechaLegible,
    formatearHora
};

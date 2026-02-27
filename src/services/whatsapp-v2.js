// src/services/whatsapp-v2.js - Sistema de notificaciones WhatsApp (Twilio + Evolution API)
import twilio from 'twilio';
import { config } from '../config/config.js';
import { getEvolutionClient } from './whatsapp-evolution.js';
import { firestore } from '../db/compat.js';
import { formatearFechaLegible, formatearHora, extractDateAndTime } from '../utils/mexico-time.js';

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
 * Fecha/hora formatting centralized in `src/utils/mexico-time.js` (America/Mexico_City)
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
     * Envía notificación de reagendamiento (cita modificada por el admin)
     */
    async sendReschedule(appt) {
        const fecha = appt.date ? formatearFechaLegible(appt.date) : formatearFechaLegible(appt.startDateTime);
        const hora = appt.time || formatearHora(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        // === EVOLUTION API (siempre intentar primero) ===
        const hasEvolution = !!(config.evolution?.apiUrl && config.evolution?.apiKey);
        if (hasEvolution) {
            try {
                const mensaje = `🔄 *Cita Reagendada*\n\nHola ${nombre}, tu cita ha sido modificada:\n\n🔹 *Servicio:* ${servicio}\n📆 *Nueva Fecha:* ${fecha}\n🕐 *Nueva Hora:* ${hora}\n📍 *Lugar:* ${config.venus.location}\n\n¡Te esperamos! ✨`;
                const result = await sendViaEvolution(appt.clientPhone, mensaje);
                if (result.success) return result;
                console.warn('[WhatsApp] Evolution falló para reagendamiento, intentando Twilio:', result.error);
            } catch (evoErr) {
                console.warn('[WhatsApp] Evolution error en reagendamiento:', evoErr.message);
            }
        }

        // === TWILIO (fallback - usa mismo template que confirmación) ===
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

        const mensaje = `🌿 *Indicaciones Antes de tu Sesión de Depilación Láser:*\n\nHola ${nombre},\n\n• Rasura el área a tratar 24 horas antes de tu cita.\n• Evita la exposición solar directa y el uso de autobronceadores al menos 72 horas antes.\n• No uses cremas, aceites, desodorantes o maquillaje el día de la sesión.\n• Suspende exfoliaciones o tratamientos irritantes una semana antes.\n• Si estás tomando antibióticos o tienes alguna condición médica, coméntalo antes de la sesión.\n\n⸻\n\n💫 *Cuidados Después de la Sesión:*\n\n• Evita exponerte al sol o calor intenso (vapor, saunas, ejercicio intenso) durante 48 horas.\n• No rasques ni frotes la piel tratada.\n• Aplica gel de aloe vera o crema calmante para hidratar y aliviar la zona.\n• No uses productos con alcohol o fragancias por al menos 24 horas.\n• Usa protector solar FPS 50 si la zona estará expuesta.`;

        // Siempre intentar Evolution primero
        const hasEvolution = !!(config.evolution?.apiUrl && config.evolution?.apiKey);
        if (hasEvolution) {
            try {
                const result = await sendViaEvolution(appt.clientPhone, mensaje);
                if (result.success) return result;
            } catch (e) { /* fall through */ }
        }

        console.warn('⚠️ WhatsApp: Recordatorio 30h - Evolution falló y Twilio no tiene template para esto.');
        return { success: false, error: 'Evolution no disponible y no hay template Twilio' };
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

        // === EVOLUTION API (siempre intentar primero - poll interactivo) ===
        const hasEvolution24 = !!(config.evolution?.apiUrl && config.evolution?.apiKey);
        if (hasEvolution24) {
            try {
                const question = `⏰ *Recordatorio de Cita*\n\nHola ${nombre}, te recordamos tu cita de mañana:\n\n🔹 *Servicio:* ${servicio}\n📆 *Fecha:* ${fecha}\n🕐 *Hora:* ${hora}\n\n¿Qué deseas hacer?`;
                const result = await sendPollViaEvolution(appt.clientPhone, question, [
                    '✅ Confirmar Asistencia',
                    '🔄 Solicitar Cambio de Horario',
                    '❌ Cancelar Cita'
                ], appt.id || appt.appointmentId || null);
                if (result.success) return result;
                console.warn('[WhatsApp] Evolution falló para recordatorio 24h, intentando Twilio:', result.error);
            } catch (evoErr) {
                console.warn('[WhatsApp] Evolution error en recordatorio 24h:', evoErr.message);
            }
        }

        // === TWILIO (fallback con template) ===
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

        // === EVOLUTION API (siempre intentar primero) ===
        const hasEvolution2h = !!(config.evolution?.apiUrl && config.evolution?.apiKey);
        if (hasEvolution2h) {
            try {
                const mensaje = `🔔 *¡Tu cita es en 2 horas!*\n\nHola ${nombre}, tu cita de ${servicio} es a las ${hora}.\n\n📍 ${config.venus.location}\n\n¡Te esperamos! ✨`;
                const result = await sendViaEvolution(appt.clientPhone, mensaje);
                if (result.success) return result;
                console.warn('[WhatsApp] Evolution falló para recordatorio 2h, intentando Twilio:', result.error);
            } catch (evoErr) {
                console.warn('[WhatsApp] Evolution error en recordatorio 2h:', evoErr.message);
            }
        }

        // === TWILIO (fallback con template) ===
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
     * Envía mensaje de solicitud de reprogramación: pide día y hora deseados
     * USA TEXTO LIBRE (Respuesta a sesión activa)
     */
    async sendSolicitudReprogramacion(appt) {
        const mensaje = `🔄 Entendido ${appt.clientName}. ¿Para qué día y hora te gustaría reagendar tu cita de *${appt.serviceName}*?\n\nPor favor dinos la fecha y hora que prefieres (por ejemplo: *lunes 3 de marzo a las 10:00 am*) y nos ponemos en contacto contigo para confirmarlo. 😊`;
        
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
        const mensaje = `❌ Tu cita ha sido cancelada exitosamente. Lamentamos no verte esta vez — cuando quieras agendar de nuevo, aquí estamos. ¡Cuídate mucho! 🌸`;
        
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
     * Alerta automática 4h antes: la cita se cancelará en 1h si no confirma
     * Incluye poll con opciones: Confirmar, Cancelar
     * SIEMPRE intenta Evolution API primero (polls interactivos)
     */
    async sendAlertaCancelacion(appt) {
        const fecha = formatearFechaLegible(appt.date || appt.startDateTime);
        const hora = appt.time || formatearHora(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        // Siempre intentar Evolution primero (poll interactivo)
        const hasEvolution = !!(config.evolution?.apiUrl && config.evolution?.apiKey);
        if (hasEvolution) {
            try {
                const mensajeAlerta = `⚠️ *Recordatorio Importante*\n\nHola ${nombre}, tu cita es hoy:\n\n🔹 *Servicio:* ${servicio}\n📆 *Fecha:* ${fecha}\n🕐 *Hora:* ${hora}\n\n*Si no confirmas tu asistencia en la próxima hora, tu cita será cancelada automáticamente.*\n\n¿Qué deseas hacer?`;
                const result = await sendPollViaEvolution(appt.clientPhone, mensajeAlerta, [
                    '✅ Confirmar Asistencia',
                    '❌ Cancelar Cita'
                ], appt.id || appt.appointmentId || null);
                if (result.success) return result;
                console.warn('[WhatsApp] Evolution falló para alerta cancelación, intentando Twilio:', result.error);
            } catch (evoErr) {
                console.warn('[WhatsApp] Evolution error en alerta cancelación:', evoErr.message);
            }
        }

        // Twilio fallback (texto libre)
        const mensaje = `⚠️ Hola ${nombre}, tu cita de ${servicio} es hoy a las ${hora}. Si no confirmas en la próxima hora, tu cita será cancelada. Responde CONFIRMO para confirmar o CANCELAR para cancelar.`;
        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    /**
     * Recordatorio manual desde admin (con opciones de confirmar, cancelar, reagendar)
     * SIEMPRE intenta Evolution API primero (polls interactivos), Twilio solo como fallback
     */
    async sendReminderWithOptions(appt) {
        const fecha = formatearFechaLegible(appt.date || appt.startDateTime);
        const hora = appt.time || formatearHora(appt.startDateTime);
        const nombre = sanitizeForWhatsApp(appt.clientName);
        const servicio = sanitizeForWhatsApp(appt.serviceName);

        // Siempre intentar Evolution primero (botón manual = interactivo con poll)
        const hasEvolution = !!(config.evolution?.apiUrl && config.evolution?.apiKey);
        if (hasEvolution) {
            try {
                const question = `📅 *Recordatorio de Cita - Venus Cosmetología*\n\nHola ${nombre}, te recordamos tu próxima cita:\n\n🔹 *Servicio:* ${servicio}\n📆 *Fecha:* ${fecha}\n🕐 *Hora:* ${hora}\n📍 *Lugar:* ${config.venus.location}\n\n¿Qué deseas hacer?`;
                const result = await sendPollViaEvolution(appt.clientPhone, question, [
                    '✅ Confirmar Asistencia',
                    '🔄 Reagendar Cita',
                    '❌ Cancelar Cita'
                ], appt.id || appt.appointmentId || null);
                if (result.success) return result;
                console.warn('[WhatsApp] Evolution falló para recordatorio manual, intentando Twilio:', result.error);
            } catch (evoErr) {
                console.warn('[WhatsApp] Evolution error en recordatorio manual:', evoErr.message);
            }
        }

        // Twilio fallback (solo si Evolution no está configurada o falló)
        const mensaje = `Hola ${nombre}, recordatorio de tu cita de ${servicio} el ${fecha} a las ${hora}. Responde: CONFIRMO, REAGENDAR o CANCELAR.`;
        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    // Helpers exportados
    formatearFechaLegible,
    formatearHora
};

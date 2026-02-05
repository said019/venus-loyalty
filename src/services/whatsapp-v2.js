// src/services/whatsapp.js - Sistema de notificaciones WhatsApp con Twilio
import twilio from 'twilio';
import { config } from '../config/config.js';

// Cliente de Twilio
let client = null;

function getTwilioClient() {
    if (!client && config.twilio.accountSid && config.twilio.authToken) {
        client = twilio(config.twilio.accountSid, config.twilio.authToken);
    }
    return client;
}

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

export const WhatsAppService = {
    /**
     * Envía confirmación de cita al momento de crearla
     * Template: confirmacion_cita
     * Variables: {{1}}=Nombre, {{2}}=Servicio, {{3}}=Fecha, {{4}}=Hora, {{5}}=Lugar
     */
    async sendConfirmation(appt) {
        // VERSION: TIMEZONE-FIX-FINAL
        // SIEMPRE usar appt.time si está disponible (es el campo más confiable)
        console.log('[WHATSAPP] 🔥 VERSION: TIMEZONE-FIX-FINAL 🔥');
        console.log('[WHATSAPP] sendConfirmation llamado con:', {
            hasTime: !!appt.time,
            time: appt.time,
            hasStartDateTime: !!appt.startDateTime
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

        console.log('[WHATSAPP] sendConfirmation FINAL:', {
            clientName: appt.clientName,
            fecha,
            hora,
            apptTimeOriginal: appt.time,
            startDateTime: appt.startDateTime
        });

        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.CONFIRMACION_CITA,
            {
                '1': sanitizeForWhatsApp(appt.clientName),
                '2': sanitizeForWhatsApp(appt.serviceName),
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

        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.RECORDATORIO_24H,
            {
                '1': sanitizeForWhatsApp(appt.clientName),
                '2': sanitizeForWhatsApp(appt.serviceName),
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

        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.RECORDATORIO_2H,
            {
                '1': sanitizeForWhatsApp(appt.clientName),
                '2': sanitizeForWhatsApp(appt.serviceName),
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

        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    /**
     * Envía mensaje de solicitud de reprogramación
     * USA TEXTO LIBRE (Respuesta a sesión activa)
     */
    async sendSolicitudReprogramacion(appt) {
        const mensaje = `🔄 Entendido ${appt.clientName}. Nos pondremos en contacto contigo pronto para reprogramar tu cita.`;
        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    /**
     * Envía confirmación de cancelación
     * USA TEXTO LIBRE (Respuesta a sesión activa)
     */
    async sendCancelacionConfirmada(appt) {
        const mensaje = `❌ Tu cita ha sido cancelada exitosamente. Esperamos verte pronto de nuevo.`;
        return await sendWhatsAppText(appt.clientPhone, mensaje);
    },

    // Helpers exportados
    formatearFechaLegible,
    formatearHora
};

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
 * Usa timezone de México para consistencia
 */
function formatearHora(dateTimeStr) {
    const date = new Date(dateTimeStr);
    return date.toLocaleTimeString('es-MX', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false,
        timeZone: 'America/Mexico_City'
    });
}

export const WhatsAppService = {
    /**
     * Envía confirmación de cita al momento de crearla
     * Template: confirmacion_cita
     * Variables: {{1}}=Nombre, {{2}}=Servicio, {{3}}=Fecha, {{4}}=Hora, {{5}}=Lugar
     */
    async sendConfirmation(appt) {
        const fecha = formatearFechaLegible(appt.startDateTime);
        const hora = formatearHora(appt.startDateTime);

        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.CONFIRMACION_CITA,
            {
                '1': appt.clientName,
                '2': appt.serviceName,
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
        const fecha = formatearFechaLegible(appt.startDateTime);
        const hora = formatearHora(appt.startDateTime);

        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.RECORDATORIO_24H,
            {
                '1': appt.clientName,
                '2': appt.serviceName,
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
        const hora = formatearHora(appt.startDateTime);

        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.RECORDATORIO_2H,
            {
                '1': appt.clientName,
                '2': appt.serviceName,
                '3': hora
            }
        );
    },

    /**
     * Envía confirmación cuando el cliente confirma su cita
     * Template: confirmacion
     * Variables: {{1}}=Nombre, {{2}}=Fecha, {{3}}=Hora
     */
    async sendConfirmacionRecibida(appt) {
        const fecha = formatearFechaLegible(appt.startDateTime);
        const hora = formatearHora(appt.startDateTime);

        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.CONFIRMACION,
            {
                '1': appt.clientName,
                '2': fecha,
                '3': hora
            }
        );
    },

    /**
     * Envía mensaje de solicitud de reprogramación
     * Template: reprogramar
     * Variables: {{1}}=Nombre
     */
    async sendSolicitudReprogramacion(appt) {
        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.REPROGRAMAR,
            {
                '1': appt.clientName
            }
        );
    },

    /**
     * Envía confirmación de cancelación
     * Template: cancelacion_confirmada
     * Variables: {{1}}=Nombre
     */
    async sendCancelacionConfirmada(appt) {
        return await sendWhatsAppTemplate(
            appt.clientPhone,
            config.templates.CANCELACION_CONFIRMADA,
            {
                '1': appt.clientName
            }
        );
    },

    // Helpers exportados
    formatearFechaLegible,
    formatearHora
};

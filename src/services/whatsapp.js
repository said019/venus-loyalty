import fetch from 'node-fetch';
import { config } from '../config/config.js';

const BASE_URL = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;

async function sendTemplateMessage({ to, templateName, languageCode = 'es', components }) {
    if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
        console.warn('⚠️ WhatsApp: Credenciales no configuradas. Saltando envío.');
        return;
    }

    const body = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: languageCode },
            components: components
        }
    };

    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.whatsapp.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('❌ Error WhatsApp API:', JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || 'Error enviando WhatsApp');
        }
        console.log(`✅ WhatsApp enviado a ${to} (Template: ${templateName})`);
        return data;
    } catch (error) {
        console.error('❌ Error enviando WhatsApp:', error.message);
    }
}

export const WhatsAppService = {
    async sendConfirmation(appt) {
        // Template: confirmacion_cita_venus
        // Vars: {{1}}=Nombre, {{2}}=Fecha, {{3}}=Hora, {{4}}=Servicio
        const date = new Date(appt.startDateTime).toLocaleDateString('es-MX');
        const time = new Date(appt.startDateTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

        await sendTemplateMessage({
            to: appt.clientPhone,
            templateName: 'confirmacion_cita_venus',
            components: [{
                type: 'body',
                parameters: [
                    { type: 'text', text: appt.clientName },
                    { type: 'text', text: date },
                    { type: 'text', text: time },
                    { type: 'text', text: appt.serviceName }
                ]
            }]
        });
    },

    async sendReminder24h(appt) {
        // Template: recordatorio_24h
        // Vars: {{1}}=Nombre, {{2}}=Fecha, {{3}}=Hora
        const date = new Date(appt.startDateTime).toLocaleDateString('es-MX');
        const time = new Date(appt.startDateTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

        await sendTemplateMessage({
            to: appt.clientPhone,
            templateName: 'recordatorio_24h',
            components: [{
                type: 'body',
                parameters: [
                    { type: 'text', text: appt.clientName },
                    { type: 'text', text: date },
                    { type: 'text', text: time }
                ]
            }]
        });
    },

    async sendReminder2h(appt) {
        // Template: 2horas_antes
        // Vars: {{1}}=Nombre, {{2}}=Servicio
        await sendTemplateMessage({
            to: appt.clientPhone,
            templateName: '2horas_antes',
            components: [{
                type: 'body',
                parameters: [
                    { type: 'text', text: appt.clientName },
                    { type: 'text', text: appt.serviceName }
                ]
            }]
        });
    }
};

// src/services/whatsapp-evolution.js - Cliente Evolution API para WhatsApp
import axios from 'axios';
import { config } from '../config/config.js';

// Eventos que la instancia debe enviar al webhook.
// MESSAGES_UPDATE es OBLIGATORIO: los votos de las encuestas (polls) llegan
// como update del mensaje original, no como mensaje nuevo.
export const EVOLUTION_EVENTS = [
    'QRCODE_UPDATED',
    'CONNECTION_UPDATE',
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE', // ← votos de encuestas
    'SEND_MESSAGE'
];

class EvolutionAPIClient {
    constructor() {
        const baseURL = config.evolution.apiUrl;
        const apiKey = config.evolution.apiKey;
        this.instanceName = config.evolution.instanceName || 'venus-loyalty';

        if (!baseURL || !apiKey) {
            throw new Error('EVOLUTION_API_URL y EVOLUTION_API_KEY son requeridos');
        }

        this.client = axios.create({
            baseURL,
            headers: {
                'Content-Type': 'application/json',
                apikey: apiKey,
            },
            timeout: 30000,
        });
    }

    // URL a la que Evolution debe mandar los eventos del webhook
    buildWebhookUrl() {
        return `${config.baseUrl}/api/webhook/evolution`;
    }

    // Crear instancia
    async createInstance() {
        const response = await this.client.post('/instance/create', {
            instanceName: this.instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            webhook: {
                url: this.buildWebhookUrl(),
                enabled: true,
                webhookByEvents: false,
                events: EVOLUTION_EVENTS
            }
        });
        return response.data;
    }

    // Leer la configuración actual del webhook (qué URL y qué eventos están registrados)
    async getWebhook() {
        try {
            const response = await this.client.get(`/webhook/find/${this.instanceName}`);
            return response.data;
        } catch (error) {
            return { error: error.response?.data || error.message };
        }
    }

    // (Re)registrar el webhook en una instancia YA existente.
    // Evolution v2 usa el shape anidado { webhook: {...} }; v1 usa el shape plano.
    // Probamos v2 y caemos a v1 si responde 400/404.
    async setWebhook(url = this.buildWebhookUrl(), events = EVOLUTION_EVENTS) {
        const nested = {
            webhook: { enabled: true, url, webhookByEvents: false, webhookBase64: false, events }
        };
        try {
            const response = await this.client.post(`/webhook/set/${this.instanceName}`, nested);
            return { shape: 'v2', data: response.data };
        } catch (errV2) {
            const flat = { enabled: true, url, webhookByEvents: false, events };
            const response = await this.client.post(`/webhook/set/${this.instanceName}`, flat);
            return { shape: 'v1', data: response.data };
        }
    }

    // Conectar y obtener QR
    async connectInstance() {
        const response = await this.client.get(`/instance/connect/${this.instanceName}`);
        return response.data;
    }

    // Obtener estado
    async getStatus() {
        try {
            const response = await this.client.get('/instance/fetchInstances');
            const instances = Array.isArray(response.data) ? response.data : [];
            const instance = instances.find((i) => i.name === this.instanceName);

            if (!instance) {
                return { connected: false, state: 'close' };
            }

            return {
                connected: instance.connectionStatus === 'open',
                state: instance.connectionStatus,
                number: instance.number || null,
            };
        } catch (error) {
            console.error('[Evolution] Error obteniendo estado:', error.message);
            return { connected: false, state: 'error' };
        }
    }

    // Enviar mensaje de texto
    async sendText(to, message) {
        const phone = this.formatPhone(to);
        const response = await this.client.post(`/message/sendText/${this.instanceName}`, {
            number: phone,
            text: message,
        });
        return response.data;
    }

    // Obtener todos los chats (conversaciones)
    async fetchChats() {
        try {
            const response = await this.client.post(`/chat/findChats/${this.instanceName}`, {});
            return Array.isArray(response.data) ? response.data : [];
        } catch (error) {
            console.error('[Evolution] Error fetchChats:', error.message);
            return [];
        }
    }

    // Obtener mensajes recientes del store. `where` permite filtrar server-side
    // (ej. { messageType: 'pollUpdateMessage' } para traer SOLO votos).
    // Sin filtro, Evolution pagina el store global y los votos recientes pueden
    // quedar fuera de la ventana devuelta — por eso el barrido de votos estuvo
    // ciego (0 rescates desde el 2 jul aunque las clientas sí votaban).
    async findRecentMessages(limit = 300, where = {}) {
        const response = await this.client.post(`/chat/findMessages/${this.instanceName}`, {
            where,
            limit,         // v1 honra limit…
            page: 1,       // …pero v2 lo IGNORA y pagina con page/offset,
            offset: limit, // donde offset es el TAMAÑO de página (default 50).
            // Sin esto, la "ventana de 300" era en realidad ~50 mensajes y los
            // votos se enterraban (incidentes Francisca 10-jul, Thania 18-jul).
        });
        const data = response.data;
        let records = [];
        if (Array.isArray(data)) records = data;
        else if (Array.isArray(data?.messages?.records)) records = data.messages.records;
        else if (Array.isArray(data?.messages)) records = data.messages;
        // Guard anti-semántica-skip: si el server reporta total>0 pero regresó 0
        // registros, esta versión interpretó offset como SKIP (saltó los
        // recientes) → reintentar con el body simple de siempre.
        if (!records.length && Number(data?.messages?.total) > 0) {
            const retry = await this.client.post(`/chat/findMessages/${this.instanceName}`, { where, limit });
            const d2 = retry.data;
            if (Array.isArray(d2)) records = d2;
            else if (Array.isArray(d2?.messages?.records)) records = d2.messages.records;
            else if (Array.isArray(d2?.messages)) records = d2.messages;
        }
        return records;
    }

    // Obtener mensajes de un chat específico
    async fetchMessages(remoteJid, limit = 50) {
        try {
            // remoteJid debe ir COMPLETO (…@s.whatsapp.net). OJO @lid: los votos
            // entrantes se guardan con key.remoteJid='…@lid' y el número REAL en
            // key.remoteJidAlt; el OR de Evolution 2.3.6+ solo compara
            // key.remoteJidAlt si TÚ mandas ese parámetro. Mandamos ambos con el
            // mismo JID: matchea chats normales (remoteJid) Y chats @lid (alt).
            const response = await this.client.post(`/chat/findMessages/${this.instanceName}`, {
                where: {
                    key: { remoteJid, remoteJidAlt: remoteJid },
                },
                limit,         // v1
                page: 1,       // v2 (offset = tamaño de página; limit se ignora)
                offset: limit,
            });
            const data = response.data;
            // Puede venir como array directo o como { messages: [...] }
            if (Array.isArray(data)) return data;
            if (Array.isArray(data?.messages?.records)) return data.messages.records;
            if (Array.isArray(data?.messages)) return data.messages;
            return [];
        } catch (error) {
            console.error('[Evolution] Error fetchMessages:', error.message);
            return [];
        }
    }

    // Obtener contacto por JID
    async fetchContact(remoteJid) {
        try {
            const response = await this.client.post(`/chat/findContacts/${this.instanceName}`, {
                where: { remoteJid },
            });
            const contacts = Array.isArray(response.data) ? response.data : [];
            return contacts[0] || null;
        } catch (error) {
            return null;
        }
    }

    // Enviar Poll (encuesta) - funciona en iOS y Android
    async sendPoll(to, question, options, selectableCount = 1) {
        const phone = this.formatPhone(to);
        const response = await this.client.post(`/message/sendPoll/${this.instanceName}`, {
            number: phone,
            name: question,
            selectableCount,
            values: options,
        });
        return response.data;
    }

    // Info del server Evolution (la raíz devuelve { version, ... }) — diagnóstico.
    async getServerInfo() {
        try {
            const response = await this.client.get('/');
            return response.data;
        } catch (error) {
            return { error: error.response?.status || error.message };
        }
    }

    // MessageUpdate del store (en Evolution ≤2.3.6 los votos viven AQUÍ, en
    // pollUpdates de la fila de update, no en el store de mensajes) — diagnóstico.
    async findStatusMessages(limit = 30) {
        try {
            const response = await this.client.post(`/chat/findStatusMessage/${this.instanceName}`, {
                where: {},
                limit,
                page: 1,
                offset: limit,
            });
            const data = response.data;
            if (Array.isArray(data)) return data;
            if (Array.isArray(data?.messages?.records)) return data.messages.records;
            if (Array.isArray(data?.messages)) return data.messages;
            return [];
        } catch (error) {
            return [{ error: error.response?.status || error.message }];
        }
    }

    // Cerrar sesión (desvincular WhatsApp)
    async logout() {
        const response = await this.client.delete(`/instance/logout/${this.instanceName}`);
        return response.data;
    }

    // Eliminar instancia
    async deleteInstance() {
        const response = await this.client.delete(`/instance/delete/${this.instanceName}`);
        return response.data;
    }

    // Formatear número mexicano
    formatPhone(phone) {
        let cleaned = String(phone).replace(/\D/g, '');
        // Si tiene 13 dígitos y empieza con 521, quitar el 1 (convertir a 52...)
        if (cleaned.length === 13 && cleaned.startsWith('521')) {
            cleaned = '52' + cleaned.substring(3);
        }
        // Si tiene 10 dígitos, agregar 52
        if (cleaned.length === 10) {
            return `52${cleaned}`;
        }
        // Si ya tiene 12 dígitos con 52, dejarlo
        if (cleaned.startsWith('52') && cleaned.length === 12) {
            return cleaned;
        }
        return cleaned;
    }
}

// Singleton
let evolutionClient = null;

export function getEvolutionClient() {
    if (!evolutionClient) {
        evolutionClient = new EvolutionAPIClient();
    }
    return evolutionClient;
}

export { EvolutionAPIClient };

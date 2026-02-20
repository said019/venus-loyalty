// src/services/whatsapp-evolution.js - Cliente Evolution API para WhatsApp
import axios from 'axios';
import { config } from '../config/config.js';

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

    // Crear instancia
    async createInstance() {
        const response = await this.client.post('/instance/create', {
            instanceName: this.instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            webhook: {
                url: `${config.baseUrl}/api/webhook/evolution`,
                enabled: true,
                webhookByEvents: false,
                events: [
                    'QRCODE_UPDATED',
                    'CONNECTION_UPDATE',
                    'MESSAGES_UPSERT',
                    'SEND_MESSAGE'
                ]
            }
        });
        return response.data;
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

    // Obtener mensajes de un chat específico
    async fetchMessages(remoteJid, limit = 50) {
        try {
            const response = await this.client.post(`/chat/findMessages/${this.instanceName}`, {
                where: {
                    key: { remoteJid },
                },
                limit,
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
            pollMessage: {
                name: question,
                selectableCount,
                values: options,
            },
        });
        return response.data;
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

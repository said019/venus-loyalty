import { WhatsAppService } from '../src/services/whatsapp-v2.js';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Cargar variables de entorno
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') }); // Ajusta path si es necesario, o asume que corre con env vars

const PHONE_NUMBER = process.env.TWILIO_ADMIN_PHONE || '525512345678'; // Fallback for test

async function test() {
    console.log('🧪 Iniciando prueba de respuesta WhatsApp...');

    // Simular objeto appt
    const mockAppt = {
        id: 'test-appt-123',
        clientName: 'Test Client',
        serviceName: 'Corte Caballero',
        date: '2025-01-01',
        time: '12:00',
        startDateTime: '2025-01-01T18:00:00.000Z', // 12:00 MX
        clientPhone: PHONE_NUMBER
    };

    console.log(`📱 Enviando a: ${mockAppt.clientPhone}`);

    try {
        const result = await WhatsAppService.sendConfirmacionRecibida(mockAppt);
        console.log('Resultado:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();

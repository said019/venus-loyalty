import 'dotenv/config';
import { EmailService } from '../src/services/emailService.js';

console.log('🧪 Probando EmailService...\n');

const testAppt = {
    clientName: 'Cliente de Prueba',
    clientEmail: 'test@example.com',
    serviceName: 'Limpieza Facial Profunda',
    date: '2025-02-15',
    time: '14:30'
};

const testRequest = {
    clientName: 'Interesado Prueba',
    clientPhone: '4271234567',
    serviceName: 'Corte de Cabello',
    date: '2025-02-20',
    time: '10:00'
};

async function runTests() {
    console.log('1. Probando envío de confirmación a cliente...');
    try {
        await EmailService.sendConfirmation(testAppt);
        console.log('   ✅ (Chequear consola para ver si intentó enviar o si usó mock)');
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }

    console.log('\n2. Probando notificación de nueva solicitud al admin...');
    try {
        await EmailService.sendNewRequestNotification(testRequest);
        console.log('   ✅ (Chequear consola)');
    } catch (e) {
        console.log('   ❌ Error:', e.message);
    }
}

runTests();

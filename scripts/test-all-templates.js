// test-all-templates.js - Prueba todos los templates de WhatsApp
import 'dotenv/config';
import { WhatsAppService } from './src/services/whatsapp-v2.js';

console.log('🧪 Prueba de TODOS los templates de WhatsApp\n');

const testAppt = {
    clientName: 'Said Romero',
    clientPhone: '4272757136',
    serviceName: 'Depilación Facial',
    startDateTime: '2025-11-28T10:00:00-06:00'
};

async function testTemplate(name, fn) {
    console.log(`\n📱 Probando: ${name}`);
    try {
        const result = await fn(testAppt);
        if (result.success) {
            console.log(`   ✅ Enviado: ${result.messageSid}`);
        } else {
            console.log(`   ❌ Error: ${result.error}`);
        }
    } catch (error) {
        console.log(`   ❌ Exception: ${error.message}`);
    }
}

(async () => {
    console.log('Cliente de prueba:', testAppt.clientName);
    console.log('Teléfono:', testAppt.clientPhone);
    console.log('Servicio:', testAppt.serviceName);
    console.log('Fecha/Hora:', testAppt.startDateTime);
    
    // Comentar/descomentar según necesites probar
    await testTemplate('Confirmación de cita', WhatsAppService.sendConfirmation);
    // await testTemplate('Recordatorio 24h', WhatsAppService.sendReminder24h);
    // await testTemplate('Recordatorio 2h', WhatsAppService.sendReminder2h);
    // await testTemplate('Confirmación recibida', WhatsAppService.sendConfirmacionRecibida);
    // await testTemplate('Solicitud reprogramación', WhatsAppService.sendSolicitudReprogramacion);
    // await testTemplate('Cancelación confirmada', WhatsAppService.sendCancelacionConfirmada);
    
    console.log('\n✅ Pruebas completadas');
})();

// test-whatsapp.js - Script de prueba para WhatsApp con Twilio
import 'dotenv/config';
import { WhatsAppService } from './src/services/whatsapp-v2.js';

console.log('🧪 Prueba de WhatsApp con Twilio\n');

// Verificar configuración
console.log('📋 Configuración:');
console.log('  TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ Configurado' : '❌ No configurado');
console.log('  TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '✅ Configurado' : '❌ No configurado');
console.log('  TWILIO_WHATSAPP_NUMBER:', process.env.TWILIO_WHATSAPP_NUMBER || '❌ No configurado');
console.log('');

// Datos de prueba
const testAppt = {
    clientName: 'Said Romero',
    clientPhone: '4272757136', // Tu número de prueba
    serviceName: 'Depilación (Facial)',
    startDateTime: '2025-11-27T20:00:00-06:00',
    location: 'Sierra del Eje Pte. 7, Villas del Parque, San Juan del Río'
};

console.log('📱 Enviando mensaje de prueba a:', testAppt.clientPhone);
console.log('   Nombre:', testAppt.clientName);
console.log('   Servicio:', testAppt.serviceName);
console.log('   Fecha/Hora:', testAppt.startDateTime);
console.log('');

// Enviar mensaje de prueba
try {
    console.log('🔄 Intentando enviar mensaje...\n');
    const result = await WhatsAppService.sendConfirmation(testAppt);
    
    if (result.success) {
        console.log('✅ Mensaje enviado exitosamente!');
        console.log('   Message SID:', result.messageSid);
    } else {
        console.log('❌ Error al enviar mensaje:');
        console.log('   ', result.error);
        console.log('\n💡 Posibles causas:');
        console.log('   1. Credenciales incorrectas o expiradas');
        console.log('   2. Número de WhatsApp no verificado en Twilio');
        console.log('   3. Template no aprobado en Twilio');
        console.log('   4. Cuenta de Twilio suspendida o sin saldo');
    }
} catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    if (error.code) console.error('   Código:', error.code);
    if (error.moreInfo) console.error('   Más info:', error.moreInfo);
}

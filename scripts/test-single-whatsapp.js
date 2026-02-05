// Script para probar envío de WhatsApp a un número específico
import 'dotenv/config';
import twilio from 'twilio';

const PHONE_TO_TEST = process.argv[2] || '4271072277'; // Hannia por defecto

const config = {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
    templateRecordatorio24h: 'HX7df380cf1918f41f494099a41dc39315'
};

async function testWhatsApp() {
    console.log('=== PRUEBA DE ENVÍO WHATSAPP ===\n');

    if (!config.accountSid || !config.authToken) {
        console.error('❌ Faltan credenciales de Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)');
        process.exit(1);
    }

    const client = twilio(config.accountSid, config.authToken);

    // Normalizar teléfono
    let phone = PHONE_TO_TEST.replace(/\D/g, '');
    if (phone.length === 10) phone = '52' + phone;
    if (!phone.startsWith('52')) phone = '52' + phone;

    console.log(`📱 Teléfono original: ${PHONE_TO_TEST}`);
    console.log(`📱 Teléfono normalizado: +${phone}`);
    console.log(`📤 Número remitente: ${config.whatsappNumber}`);
    console.log(`📝 Template: ${config.templateRecordatorio24h}`);
    console.log('');

    try {
        // Probar con el template de recordatorio 24h
        const messageParams = {
            from: config.whatsappNumber,
            to: `whatsapp:+${phone}`,
            contentSid: config.templateRecordatorio24h,
            contentVariables: JSON.stringify({
                '1': 'Hannia Test',
                '2': 'Servicio de Prueba',
                '3': '5 de febrero',
                '4': '10:00'
            })
        };

        console.log('📤 Enviando mensaje...');
        console.log('   Parámetros:', JSON.stringify(messageParams, null, 2));
        console.log('');

        const message = await client.messages.create(messageParams);

        console.log('✅ MENSAJE ACEPTADO POR TWILIO');
        console.log(`   SID: ${message.sid}`);
        console.log(`   Status: ${message.status}`);
        console.log(`   Dirección: ${message.direction}`);
        console.log(`   Fecha: ${message.dateCreated}`);
        console.log('');

        // Esperar unos segundos y verificar el estado
        console.log('⏳ Esperando 5 segundos para verificar estado de entrega...');
        await new Promise(r => setTimeout(r, 5000));

        const updatedMessage = await client.messages(message.sid).fetch();
        console.log('');
        console.log('📊 ESTADO ACTUALIZADO:');
        console.log(`   Status: ${updatedMessage.status}`);
        console.log(`   Error Code: ${updatedMessage.errorCode || 'ninguno'}`);
        console.log(`   Error Message: ${updatedMessage.errorMessage || 'ninguno'}`);

        if (updatedMessage.status === 'delivered') {
            console.log('\n🎉 ¡MENSAJE ENTREGADO EXITOSAMENTE!');
        } else if (updatedMessage.status === 'sent' || updatedMessage.status === 'queued') {
            console.log('\n📨 Mensaje en cola/enviado, verificar entrega en Twilio Console');
        } else if (updatedMessage.status === 'failed' || updatedMessage.status === 'undelivered') {
            console.log('\n❌ FALLO EN LA ENTREGA');
            console.log(`   Código: ${updatedMessage.errorCode}`);
            console.log(`   Motivo: ${updatedMessage.errorMessage}`);
        }

    } catch (error) {
        console.error('❌ ERROR AL ENVIAR:');
        console.error(`   Mensaje: ${error.message}`);
        console.error(`   Código: ${error.code}`);
        console.error(`   Más info: ${error.moreInfo || 'N/A'}`);
    }
}

testWhatsApp();

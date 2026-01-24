
import { WhatsAppService } from '../src/services/whatsapp-v2.js';

async function main() {
    const appt = {
        clientName: 'Dulce Fernanda Gasca López',
        clientPhone: '4271833979',
        serviceName: 'Depilacion Piernas + axila + bikini',
        date: '2026-01-24',
        time: '16:00',
        location: 'Cactus 50, San Juan del Río'
    };

    console.log(`--- Reenviando confirmación a: ${appt.clientName} ---`);

    try {
        const result = await WhatsAppService.sendConfirmation(appt);

        if (result.success) {
            console.log('✅ Mensaje de confirmación enviado exitosamente.');
            console.log('ID del mensaje:', result.messageSid);
        } else {
            console.error('❌ Error al enviar el mensaje:', result.error);
        }
    } catch (error) {
        console.error('Error inesperado:', error);
    }
}

main();

import cron from 'node-cron';
import { AppointmentModel } from '../models/index.js';
import { WhatsAppService } from '../services/whatsapp.js';

export function startScheduler() {
    console.log('⏰ Scheduler de recordatorios WhatsApp iniciado (cada 10 min)');

    // Helper para convertir a ISO con offset de México (-06:00)
    const toMexicoCityISO = (date) => {
        const ts = date.getTime();
        const mexicoOffset = 6 * 60 * 60 * 1000;
        const localDate = new Date(ts - mexicoOffset);
        return localDate.toISOString().replace('Z', '-06:00');
    };

    // Correr cada 10 minutos
    cron.schedule('*/10 * * * *', async () => {
        console.log('⏰ Ejecutando chequeo de recordatorios...');
        const now = new Date();

        try {
            // --- RECORDATORIO 24 HORAS ---
            // Buscamos citas que ocurran entre 23.5h y 24.5h desde ahora
            const date24hStart = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);
            const date24hEnd = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);

            const start24h = toMexicoCityISO(date24hStart);
            const end24h = toMexicoCityISO(date24hEnd);

            const pending24h = await AppointmentModel.getPendingReminders('send24h', start24h, end24h);
            console.log(`📅 Encontrados ${pending24h.length} recordatorios 24h pendientes`);

            for (const appt of pending24h) {
                // Solo enviar si la cita no está cancelada
                if (appt.status !== 'cancelled') {
                    const result = await WhatsAppService.sendReminder24h(appt);
                    if (result.success) {
                        await AppointmentModel.markReminderSent(appt.id, '24h');
                        console.log(`✅ Recordatorio 24h enviado para cita ${appt.id}`);
                    }
                }
            }

            // --- RECORDATORIO 2 HORAS ---
            // Buscamos citas que ocurran entre 1.5h y 2.5h desde ahora
            const date2hStart = new Date(now.getTime() + 1.5 * 60 * 60 * 1000);
            const date2hEnd = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);

            const start2h = toMexicoCityISO(date2hStart);
            const end2h = toMexicoCityISO(date2hEnd);

            const pending2h = await AppointmentModel.getPendingReminders('send2h', start2h, end2h);
            console.log(`📅 Encontrados ${pending2h.length} recordatorios 2h pendientes`);

            for (const appt of pending2h) {
                // Solo enviar si la cita no está cancelada
                if (appt.status !== 'cancelled') {
                    const result = await WhatsAppService.sendReminder2h(appt);
                    if (result.success) {
                        await AppointmentModel.markReminderSent(appt.id, '2h');
                        console.log(`✅ Recordatorio 2h enviado para cita ${appt.id}`);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error en scheduler de recordatorios:', error);
        }
    });

    console.log('✅ Sistema de notificaciones WhatsApp con Twilio listo');
}

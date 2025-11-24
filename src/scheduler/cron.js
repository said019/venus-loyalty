import cron from 'node-cron';
import { AppointmentModel } from '../models/index.js';
import { WhatsAppService } from '../services/whatsapp.js';

export function startScheduler() {
    console.log('⏰ Scheduler de recordatorios iniciado (cada 10 min)');

    // Correr cada 10 minutos
    cron.schedule('*/10 * * * *', async () => {
        console.log('⏰ Ejecutando chequeo de recordatorios...');
        const now = new Date();

        // --- RECORDATORIO 24 HORAS ---
        // Buscamos citas que ocurran entre 23.5h y 24.5h desde ahora
        const start24h = new Date(now.getTime() + 23.5 * 60 * 60 * 1000).toISOString();
        const end24h = new Date(now.getTime() + 24.5 * 60 * 60 * 1000).toISOString();

        const pending24h = await AppointmentModel.getPendingReminders('send24h', start24h, end24h);
        console.log(`Found ${pending24h.length} pending 24h reminders`);

        for (const appt of pending24h) {
            await WhatsAppService.sendReminder24h(appt);
            await AppointmentModel.markReminderSent(appt.id, '24h');
        }

        // --- RECORDATORIO 2 HORAS ---
        // Buscamos citas que ocurran entre 1.5h y 2.5h desde ahora
        const start2h = new Date(now.getTime() + 1.5 * 60 * 60 * 1000).toISOString();
        const end2h = new Date(now.getTime() + 2.5 * 60 * 60 * 1000).toISOString();

        const pending2h = await AppointmentModel.getPendingReminders('send2h', start2h, end2h);
        console.log(`Found ${pending2h.length} pending 2h reminders`);

        for (const appt of pending2h) {
            await WhatsAppService.sendReminder2h(appt);
            await AppointmentModel.markReminderSent(appt.id, '2h');
        }
    });
}

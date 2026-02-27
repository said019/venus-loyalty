import cron from 'node-cron';
import { AppointmentModel } from '../models/index.js';
import { WhatsAppService } from '../services/whatsapp-v2.js';
import { prisma } from '../db/index.js';
import { NotificationsRepo } from '../db/repositories.js';

export function startScheduler() {
    console.log('⏰ Scheduler de recordatorios WhatsApp iniciado (cada hora)');
    console.log('⏰ Scheduler de notificaciones automáticas iniciado');

    // Helper para convertir a ISO con offset de México (-06:00)
    const toMexicoCityISO = (date) => {
        const ts = date.getTime();
        const mexicoOffset = 6 * 60 * 60 * 1000;
        const localDate = new Date(ts - mexicoOffset);
        return localDate.toISOString().replace('Z', '-06:00');
    };

    // Correr cada hora (al minuto 0)
    cron.schedule('0 * * * *', async () => {
        console.log('⏰ Ejecutando chequeo de recordatorios...');
        const now = new Date();

        try {
            // --- RECORDATORIO 30 HORAS (DEPILACIÓN) ---
            // Buscamos citas que ocurran entre 29h y 31h desde ahora (ventana de 2 horas)
            const date30hStart = new Date(now.getTime() + 29 * 60 * 60 * 1000);
            const date30hEnd = new Date(now.getTime() + 31 * 60 * 60 * 1000);

            const start30h = toMexicoCityISO(date30hStart);
            const end30h = toMexicoCityISO(date30hEnd);

            const pending30h = await AppointmentModel.getPendingReminders('send30h', start30h, end30h);
            console.log(`📅 Encontrados ${pending30h.length} recordatorios 30h pendientes`);

            for (const appt of pending30h) {
                // Solo enviar si la cita no está cancelada
                if (appt.status !== 'cancelled') {
                    const result = await WhatsAppService.sendReminder30h(appt);
                    if (result.success) {
                        await AppointmentModel.markReminderSent(appt.id, '30h');
                        console.log(`✅ Recordatorio 30h enviado para cita ${appt.id}`);
                    }
                }
            }

            // --- RECORDATORIO 24 HORAS ---
            // Buscamos citas que ocurran entre 23h y 25h desde ahora (ventana de 2 horas)
            const date24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
            const date24hEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

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
            // Buscamos citas que ocurran entre 1h 50min y 2h 10min desde ahora (ventana de 20 minutos)
            const date2hStart = new Date(now.getTime() + 1 * 60 * 60 * 1000 + 50 * 60 * 1000);
            const date2hEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 10 * 60 * 1000);

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

    // ========== ALERTA 4H: Confirmar o se cancela en 1h ==========
    // Corre cada 10 minutos para mayor precisión
    cron.schedule('*/10 * * * *', async () => {
        const now = new Date();

        try {
            // Ventana: citas que faltan entre 3h 50min y 4h 10min (ventana de 20 min centrada en 4h)
            const rangeStart = toMexicoCityISO(new Date(now.getTime() + 3 * 60 * 60 * 1000 + 50 * 60 * 1000));
            const rangeEnd   = toMexicoCityISO(new Date(now.getTime() + 4 * 60 * 60 * 1000 + 10 * 60 * 1000));

            const pendingAlerts = await AppointmentModel.getPendingConfirmationAlert(rangeStart, rangeEnd);

            if (pendingAlerts.length > 0) {
                console.log(`⚠️ [4h-alert] ${pendingAlerts.length} citas sin confirmar — enviando alerta de cancelación`);
            }

            for (const appt of pendingAlerts) {
                const result = await WhatsAppService.sendAlertaCancelacion(appt);
                if (result.success) {
                    await AppointmentModel.markConfirmationAlertSent(appt.id);

                    // Notificación interna para el admin
                    await NotificationsRepo.create({
                        type: 'alerta',
                        icon: 'exclamation-triangle',
                        title: 'Alerta de confirmación enviada',
                        message: `Se envió alerta a ${appt.clientName} — ${appt.serviceName} a las ${appt.time || ''}. Se cancelará si no confirma.`,
                        read: false,
                        entityId: appt.id
                    });
                    console.log(`⚠️ Alerta de cancelación enviada a ${appt.clientName} (cita ${appt.id})`);
                }
            }
        } catch (error) {
            console.error('❌ Error en scheduler alerta 4h:', error);
        }
    });

    // ========== AUTO-CANCELACIÓN 1h: Cancela si no confirmó ==========
    // Corre cada 10 minutos
    cron.schedule('*/10 * * * *', async () => {
        const now = new Date();

        try {
            // Ventana: citas que faltan entre 50min y 1h 10min (ventana de 20 min centrada en 1h)
            const rangeStart = toMexicoCityISO(new Date(now.getTime() + 50 * 60 * 1000));
            const rangeEnd   = toMexicoCityISO(new Date(now.getTime() + 70 * 60 * 1000));

            const pendingCancel = await AppointmentModel.getPendingAutoCancelation(rangeStart, rangeEnd);

            if (pendingCancel.length > 0) {
                console.log(`❌ [auto-cancel] ${pendingCancel.length} citas sin confirmar — cancelando automáticamente`);
            }

            for (const appt of pendingCancel) {
                // Cancelar la cita
                await prisma.appointment.update({
                    where: { id: appt.id },
                    data: {
                        status: 'cancelled',
                        autoCancelledAt: new Date(),
                        cancelledVia: 'auto-no-confirmation',
                        updatedAt: new Date()
                    }
                });

                // Eliminar de Google Calendar si aplica
                try {
                    const { deleteEvent } = await import('../services/googleCalendarService.js');
                    const { config } = await import('../config/config.js');

                    if (appt.googleCalendarEventId) {
                        await deleteEvent(appt.googleCalendarEventId, config.google.calendarOwner1).catch(() => {});
                    }
                    if (appt.googleCalendarEventId2) {
                        await deleteEvent(appt.googleCalendarEventId2, config.google.calendarOwner2).catch(() => {});
                    }
                } catch (calErr) {
                    console.error('⚠️ Error eliminando eventos del calendario:', calErr.message);
                }

                await NotificationsRepo.create({
                    type: 'alerta',
                    icon: 'calendar-times',
                    title: 'Cita cancelada automáticamente',
                    message: `La cita de ${appt.clientName} — ${appt.serviceName} fue cancelada por no confirmar.`,
                    read: false,
                    entityId: appt.id
                });

                // Avisar a la cliente
                const fecha = WhatsAppService.formatearFechaLegible(appt.date || appt.startDateTime);
                const hora  = appt.time || WhatsAppService.formatearHora(appt.startDateTime);
                const msgCancelacion = `❌ Hola ${appt.clientName}, tu cita de *${appt.serviceName}* del ${fecha} a las ${hora} fue *cancelada automáticamente* porque no se recibió confirmación.\n\nSi deseas agendar de nuevo, con gusto te atendemos. 🌸`;

                try {
                    const { getEvolutionClient } = await import('../services/whatsapp-evolution.js');
                    const evo = getEvolutionClient();
                    await evo.sendText(appt.clientPhone, msgCancelacion);
                } catch (wErr) {
                    console.error('⚠️ No se pudo notificar cancelación automática:', wErr.message);
                }

                console.log(`❌ Cita ${appt.id} de ${appt.clientName} cancelada automáticamente`);
            }
        } catch (error) {
            console.error('❌ Error en scheduler auto-cancelación:', error);
        }
    });

    console.log('✅ Sistema de notificaciones WhatsApp con Twilio listo');

    // ========== NOTIFICACIONES AUTOMÁTICAS (cada hora) ==========
    cron.schedule('0 * * * *', async () => {
        console.log('🔔 Ejecutando chequeo de notificaciones automáticas...');
        
        try {
            await checkBirthdays();
            await checkCompletedCards();
            await checkLowStock();
            await checkExpiringGiftCards();
        } catch (error) {
            console.error('❌ Error en notificaciones automáticas:', error);
        }
    });
}

// ========== CUMPLEAÑOS (próximos 7 días) ==========
async function checkBirthdays() {
    try {
        const now = new Date();
        
        const cards = await prisma.card.findMany({ where: { status: 'active' } });
        
        const birthdays = [];
        for (const card of cards) {
            if (card.birthday) {
                const [month, day] = card.birthday.split('-').map(Number);
                const birthdayThisYear = new Date(now.getFullYear(), month - 1, day);
                const daysUntil = Math.ceil((birthdayThisYear - now) / (1000 * 60 * 60 * 24));
                if (daysUntil >= 0 && daysUntil <= 7) {
                    birthdays.push({ id: card.id, name: card.name, phone: card.phone, daysUntil });
                }
            }
        }
        
        if (birthdays.length > 0) {
            const today = now.toISOString().split('T')[0];
            const existingNotif = await prisma.notification.findFirst({
                where: { type: 'cumpleaños', createdAt: { gte: new Date(today) } }
            });
            if (!existingNotif) {
                await NotificationsRepo.create({
                    type: 'cumpleaños',
                    icon: 'birthday-cake',
                    title: `${birthdays.length} cumpleaños próximos`,
                    message: birthdays.map(b => `${b.name} (en ${b.daysUntil} días)`).join(', '),
                    read: false,
                    entityId: null
                });
                console.log(`🎂 Notificación de cumpleaños creada: ${birthdays.length} clientes`);
            }
        }
    } catch (error) {
        console.error('Error checking birthdays:', error);
    }
}

// ========== TARJETAS COMPLETADAS (últimas 24h) ==========
async function checkCompletedCards() {
    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const redeems = await prisma.cardEvent.findMany({
            where: { type: 'redeem', timestamp: { gte: yesterday } }
        });
        
        if (redeems.length > 0) {
            await NotificationsRepo.create({
                type: 'premio',
                icon: 'gift',
                title: `${redeems.length} tarjeta${redeems.length > 1 ? 's' : ''} completada${redeems.length > 1 ? 's' : ''}`,
                message: `${redeems.map(r => r.clientName || 'Cliente').join(', ')} ${redeems.length > 1 ? 'completaron' : 'completó'} su tarjeta`,
                read: false,
                entityId: null
            });
            console.log(`🎁 Notificación de tarjetas completadas: ${redeems.length}`);
        }
    } catch (error) {
        console.error('Error checking completed cards:', error);
    }
}

// ========== STOCK BAJO ==========
async function checkLowStock() {
    try {
        const products = await prisma.product.findMany();
        
        const lowStockProducts = products.filter(p => {
            const stock = p.stock || 0;
            const minStock = p.minStock || 5;
            return stock <= minStock && stock > 0;
        }).map(p => ({ id: p.id, name: p.name, stock: p.stock || 0, minStock: p.minStock || 5 }));
        
        if (lowStockProducts.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            const existingNotif = await prisma.notification.findFirst({
                where: { type: 'stock', createdAt: { gte: new Date(today) } }
            });
            if (!existingNotif) {
                await NotificationsRepo.create({
                    type: 'stock',
                    icon: 'exclamation-triangle',
                    title: `${lowStockProducts.length} producto${lowStockProducts.length > 1 ? 's' : ''} con stock bajo`,
                    message: lowStockProducts.map(p => `${p.name} (${p.stock} unidades)`).join(', '),
                    read: false,
                    entityId: null
                });
                console.log(`⚠️ Notificación de stock bajo: ${lowStockProducts.length} productos`);
            }
        }
    } catch (error) {
        console.error('Error checking low stock:', error);
    }
}

// ========== GIFT CARDS POR VENCER (próximos 7 días) ==========
async function checkExpiringGiftCards() {
    try {
        const now = new Date();
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const expiring = await prisma.giftCard.findMany({
            where: { status: 'pending', expiresAt: { lte: in7Days, gte: now } }
        });
        
        if (expiring.length > 0) {
            const expiringCards = expiring.map(gc => ({
                id: gc.id,
                code: gc.code,
                serviceName: gc.serviceName,
                recipientName: gc.recipientName || 'Sin nombre',
                daysUntil: Math.ceil((new Date(gc.expiresAt) - now) / (1000 * 60 * 60 * 24))
            }));
            
            const today = now.toISOString().split('T')[0];
            const existingNotif = await prisma.notification.findFirst({
                where: { type: 'giftcard', createdAt: { gte: new Date(today) } }
            });
            if (!existingNotif) {
                await NotificationsRepo.create({
                    type: 'giftcard',
                    icon: 'clock',
                    title: `${expiringCards.length} gift card${expiringCards.length > 1 ? 's' : ''} por vencer`,
                    message: expiringCards.map(gc => `${gc.code} - ${gc.serviceName} (${gc.daysUntil} días)`).join(', '),
                    read: false,
                    entityId: null
                });
                console.log(`⏰ Notificación de gift cards por vencer: ${expiringCards.length}`);
            }
        }
    } catch (error) {
        console.error('Error checking expiring gift cards:', error);
    }
}

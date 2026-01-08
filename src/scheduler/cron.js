import cron from 'node-cron';
import { AppointmentModel } from '../models/index.js';
import { WhatsAppService } from '../services/whatsapp-v2.js';
import { firestore } from '../db/compat.js';

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
            // Buscamos citas que ocurran entre 1h y 3h desde ahora (ventana de 2 horas)
            const date2hStart = new Date(now.getTime() + 1 * 60 * 60 * 1000);
            const date2hEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000);

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
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        
        const snapshot = await firestore.collection('cards')
            .where('status', '==', 'active')
            .get();
        
        const birthdays = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.birthday) {
                const [month, day] = data.birthday.split('-').map(Number);
                
                // Calcular días hasta el cumpleaños
                const birthdayThisYear = new Date(now.getFullYear(), month - 1, day);
                const daysUntil = Math.ceil((birthdayThisYear - now) / (1000 * 60 * 60 * 24));
                
                if (daysUntil >= 0 && daysUntil <= 7) {
                    birthdays.push({
                        id: doc.id,
                        name: data.name,
                        phone: data.phone,
                        daysUntil
                    });
                }
            }
        });
        
        // Crear notificación si hay cumpleaños próximos
        if (birthdays.length > 0) {
            // Verificar si ya existe notificación de hoy
            const today = now.toISOString().split('T')[0];
            const existingNotif = await firestore.collection('notifications')
                .where('type', '==', 'cumpleaños')
                .where('createdAt', '>=', today)
                .limit(1)
                .get();
            
            if (existingNotif.empty) {
                await firestore.collection('notifications').add({
                    type: 'cumpleaños',
                    icon: 'birthday-cake',
                    title: `${birthdays.length} cumpleaños próximos`,
                    message: birthdays.map(b => `${b.name} (en ${b.daysUntil} días)`).join(', '),
                    read: false,
                    createdAt: new Date().toISOString(),
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
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const snapshot = await firestore.collection('events')
            .where('type', '==', 'redeem')
            .where('timestamp', '>=', yesterday.toISOString())
            .get();
        
        if (!snapshot.empty) {
            const redeems = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                redeems.push({
                    cardId: data.cardId,
                    clientName: data.clientName || 'Cliente'
                });
            });
            
            // Crear notificación
            await firestore.collection('notifications').add({
                type: 'premio',
                icon: 'gift',
                title: `${redeems.length} tarjeta${redeems.length > 1 ? 's' : ''} completada${redeems.length > 1 ? 's' : ''}`,
                message: `${redeems.map(r => r.clientName).join(', ')} ${redeems.length > 1 ? 'completaron' : 'completó'} su tarjeta`,
                read: false,
                createdAt: new Date().toISOString(),
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
        const snapshot = await firestore.collection('products').get();
        
        const lowStockProducts = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const stock = data.stock || 0;
            const minStock = data.minStock || 5;
            
            if (stock <= minStock && stock > 0) {
                lowStockProducts.push({
                    id: doc.id,
                    name: data.name,
                    stock,
                    minStock
                });
            }
        });
        
        if (lowStockProducts.length > 0) {
            // Verificar si ya existe notificación de hoy
            const today = new Date().toISOString().split('T')[0];
            const existingNotif = await firestore.collection('notifications')
                .where('type', '==', 'stock')
                .where('createdAt', '>=', today)
                .limit(1)
                .get();
            
            if (existingNotif.empty) {
                await firestore.collection('notifications').add({
                    type: 'stock',
                    icon: 'exclamation-triangle',
                    title: `${lowStockProducts.length} producto${lowStockProducts.length > 1 ? 's' : ''} con stock bajo`,
                    message: lowStockProducts.map(p => `${p.name} (${p.stock} unidades)`).join(', '),
                    read: false,
                    createdAt: new Date().toISOString(),
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
        
        const snapshot = await firestore.collection('giftcards')
            .where('status', '==', 'pending')
            .where('expiresAt', '<=', in7Days.toISOString())
            .where('expiresAt', '>=', now.toISOString())
            .get();
        
        if (!snapshot.empty) {
            const expiringCards = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const daysUntil = Math.ceil((new Date(data.expiresAt) - now) / (1000 * 60 * 60 * 24));
                expiringCards.push({
                    id: doc.id,
                    code: data.code,
                    serviceName: data.serviceName,
                    recipientName: data.recipientName || 'Sin nombre',
                    daysUntil
                });
            });
            
            // Verificar si ya existe notificación de hoy
            const today = now.toISOString().split('T')[0];
            const existingNotif = await firestore.collection('notifications')
                .where('type', '==', 'giftcard')
                .where('createdAt', '>=', today)
                .limit(1)
                .get();
            
            if (existingNotif.empty) {
                await firestore.collection('notifications').add({
                    type: 'giftcard',
                    icon: 'clock',
                    title: `${expiringCards.length} gift card${expiringCards.length > 1 ? 's' : ''} por vencer`,
                    message: expiringCards.map(gc => `${gc.code} - ${gc.serviceName} (${gc.daysUntil} días)`).join(', '),
                    read: false,
                    createdAt: new Date().toISOString(),
                    entityId: null
                });
                console.log(`⏰ Notificación de gift cards por vencer: ${expiringCards.length}`);
            }
        }
    } catch (error) {
        console.error('Error checking expiring gift cards:', error);
    }
}

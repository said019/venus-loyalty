/**
 * Script de migración de Firebase a PostgreSQL
 * Ejecutar: node scripts/migrate-firebase-to-postgres.js
 */

import { PrismaClient } from '@prisma/client';
import { firestore } from '../lib/firebase.js';

const prisma = new PrismaClient();

async function migrateCards() {
  console.log('\n📇 Migrando tarjetas (cards)...');
  const snapshot = await firestore.collection('cards').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      await prisma.card.upsert({
        where: { id: doc.id },
        update: {},
        create: {
          id: doc.id,
          name: data.name || 'Sin nombre',
          phone: data.phone || `unknown_${doc.id}`,
          email: data.email || null,
          birthday: data.birthday || null,
          stamps: data.stamps || 0,
          max: data.max || 8,
          cycles: data.cycles || 0,
          status: data.status || 'active',
          lastVisit: data.lastVisit ? new Date(data.lastVisit) : null,
          source: data.source || null,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
        }
      });
      count++;
    } catch (error) {
      console.error(`  ❌ Error en card ${doc.id}:`, error.message);
    }
  }
  console.log(`  ✅ ${count}/${snapshot.docs.length} tarjetas migradas`);
}

async function migrateServices() {
  console.log('\n🛠️ Migrando servicios (services)...');
  const snapshot = await firestore.collection('services').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      // Convertir description de array a string si es necesario
      let description = data.description;
      if (Array.isArray(description)) {
        description = description.join(' ');
      }
      
      await prisma.service.upsert({
        where: { id: doc.id },
        update: {},
        create: {
          id: doc.id,
          name: data.name || 'Sin nombre',
          description: description || null,
          price: data.price || 0,
          durationMinutes: data.durationMinutes || 60,
          category: data.category || null,
          isActive: data.isActive !== false,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
        }
      });
      count++;
    } catch (error) {
      console.error(`  ❌ Error en service ${doc.id}:`, error.message);
    }
  }
  console.log(`  ✅ ${count}/${snapshot.docs.length} servicios migrados`);
}

async function migrateAppointments() {
  console.log('\n📅 Migrando citas (appointments)...');
  const snapshot = await firestore.collection('appointments').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      // Parsear fechas
      let startDateTime = new Date();
      let endDateTime = new Date();
      
      if (data.startDateTime) {
        startDateTime = new Date(data.startDateTime);
      } else if (data.date && data.time) {
        startDateTime = new Date(`${data.date}T${data.time}:00`);
      }
      
      if (data.endDateTime) {
        endDateTime = new Date(data.endDateTime);
      } else {
        endDateTime = new Date(startDateTime.getTime() + (data.durationMinutes || 60) * 60000);
      }

      await prisma.appointment.upsert({
        where: { id: doc.id },
        update: {},
        create: {
          id: doc.id,
          clientName: data.clientName || data.name || 'Sin nombre',
          clientPhone: data.clientPhone || data.phone || '',
          serviceName: data.serviceName || 'Sin servicio',
          date: data.date || startDateTime.toISOString().split('T')[0],
          time: data.time || startDateTime.toTimeString().slice(0, 5),
          startDateTime,
          endDateTime,
          durationMinutes: data.durationMinutes || 60,
          status: data.status || 'scheduled',
          location: data.location || null,
          totalPaid: data.totalPaid || null,
          paymentMethod: data.paymentMethod || null,
          discount: data.discount || null,
          googleCalendarEventId: data.googleCalendarEventId || null,
          googleCalendarEventId2: data.googleCalendarEventId2 || null,
          sendWhatsApp24h: data.sendWhatsApp24h !== false,
          sendWhatsApp2h: data.sendWhatsApp2h !== false,
          sent24hAt: data.reminders?.sent24hAt ? new Date(data.reminders.sent24hAt) : null,
          sent2hAt: data.reminders?.sent2hAt ? new Date(data.reminders.sent2hAt) : null,
          confirmedAt: data.confirmedAt ? new Date(data.confirmedAt) : null,
          cancelledAt: data.cancelledAt ? new Date(data.cancelledAt) : null,
          cancelReason: data.cancelReason || null,
          productsSold: data.productsSold || null,
          source: data.source || null,
          cardId: data.cardId || null,
          serviceId: data.serviceId || null,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
        }
      });
      count++;
    } catch (error) {
      console.error(`  ❌ Error en appointment ${doc.id}:`, error.message);
    }
  }
  console.log(`  ✅ ${count}/${snapshot.docs.length} citas migradas`);
}

async function migrateEvents() {
  console.log('\n📝 Migrando eventos (events)...');
  const snapshot = await firestore.collection('events').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      await prisma.event.upsert({
        where: { id: doc.id },
        update: {},
        create: {
          id: doc.id,
          type: data.type || 'stamp',
          cardId: data.cardId || 'unknown',
          staffId: data.staffId || null,
          staffName: data.staffName || null,
          note: data.note || null,
          timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        }
      });
      count++;
    } catch (error) {
      console.error(`  ❌ Error en event ${doc.id}:`, error.message);
    }
  }
  console.log(`  ✅ ${count}/${snapshot.docs.length} eventos migrados`);
}

async function migrateProducts() {
  console.log('\n📦 Migrando productos (products)...');
  const snapshot = await firestore.collection('products').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      await prisma.product.upsert({
        where: { id: doc.id },
        update: {},
        create: {
          id: doc.id,
          name: data.name || 'Sin nombre',
          category: data.category || null,
          presentation: data.presentation || null,
          price: data.price || 0,
          cost: data.cost || null,
          stock: data.stock || 0,
          minStock: data.minStock || 5,
          description: data.description || null,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
        }
      });
      count++;
    } catch (error) {
      console.error(`  ❌ Error en product ${doc.id}:`, error.message);
    }
  }
  console.log(`  ✅ ${count}/${snapshot.docs.length} productos migrados`);
}

async function migrateExpenses() {
  console.log('\n💸 Migrando gastos (expenses)...');
  const snapshot = await firestore.collection('expenses').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      await prisma.expense.upsert({
        where: { id: doc.id },
        update: {},
        create: {
          id: doc.id,
          date: data.date || new Date().toISOString().split('T')[0],
          category: data.category || 'otros',
          description: data.description || '',
          amount: data.amount || 0,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
        }
      });
      count++;
    } catch (error) {
      console.error(`  ❌ Error en expense ${doc.id}:`, error.message);
    }
  }
  console.log(`  ✅ ${count}/${snapshot.docs.length} gastos migrados`);
}

async function migrateGiftCards() {
  console.log('\n🎁 Migrando gift cards (giftcards)...');
  const snapshot = await firestore.collection('giftcards').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      await prisma.giftCard.upsert({
        where: { id: doc.id },
        update: {},
        create: {
          id: doc.id,
          code: data.code || doc.id,
          amount: data.amount || 0,
          remainingAmount: data.remainingAmount ?? data.amount ?? 0,
          status: data.status || 'pending',
          purchaserName: data.purchaserName || null,
          purchaserPhone: data.purchaserPhone || null,
          recipientName: data.recipientName || null,
          recipientPhone: data.recipientPhone || null,
          message: data.message || null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          usedAt: data.usedAt ? new Date(data.usedAt) : null,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
        }
      });
      count++;
    } catch (error) {
      console.error(`  ❌ Error en giftcard ${doc.id}:`, error.message);
    }
  }
  console.log(`  ✅ ${count}/${snapshot.docs.length} gift cards migradas`);
}

async function migrateNotifications() {
  console.log('\n🔔 Migrando notificaciones (notifications)...');
  const snapshot = await firestore.collection('notifications').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      await prisma.notification.upsert({
        where: { id: doc.id },
        update: {},
        create: {
          id: doc.id,
          type: data.type || 'info',
          icon: data.icon || null,
          title: data.title || 'Notificación',
          message: data.message || '',
          read: data.read || false,
          data: data.data || null,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        }
      });
      count++;
    } catch (error) {
      console.error(`  ❌ Error en notification ${doc.id}:`, error.message);
    }
  }
  console.log(`  ✅ ${count}/${snapshot.docs.length} notificaciones migradas`);
}

async function migrateBookingRequests() {
  console.log('\n📋 Migrando solicitudes de reserva (booking_requests)...');
  const snapshot = await firestore.collection('booking_requests').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      await prisma.bookingRequest.upsert({
        where: { id: doc.id },
        update: {},
        create: {
          id: doc.id,
          name: data.name || 'Sin nombre',
          phone: data.phone || '',
          serviceId: data.serviceId || null,
          serviceName: data.serviceName || 'Sin servicio',
          date: data.date || '',
          time: data.time || '',
          status: data.status || 'pending',
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
        }
      });
      count++;
    } catch (error) {
      console.error(`  ❌ Error en booking_request ${doc.id}:`, error.message);
    }
  }
  console.log(`  ✅ ${count}/${snapshot.docs.length} solicitudes migradas`);
}

async function migrateSettings() {
  console.log('\n⚙️ Migrando configuración (settings)...');
  const snapshot = await firestore.collection('settings').get();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      await prisma.setting.upsert({
        where: { key: doc.id },
        update: { value: data },
        create: {
          key: doc.id,
          value: data,
        }
      });
      count++;
    } catch (error) {
      console.error(`  ❌ Error en setting ${doc.id}:`, error.message);
    }
  }
  console.log(`  ✅ ${count}/${snapshot.docs.length} configuraciones migradas`);
}

async function main() {
  console.log('🚀 Iniciando migración de Firebase a PostgreSQL...\n');
  console.log('=' .repeat(50));
  
  try {
    // Conectar a la base de datos
    await prisma.$connect();
    console.log('✅ Conectado a PostgreSQL');
    
    // Migrar en orden (respetando dependencias)
    await migrateCards();
    await migrateServices();
    await migrateAppointments();
    await migrateEvents();
    await migrateProducts();
    await migrateExpenses();
    await migrateGiftCards();
    await migrateNotifications();
    await migrateBookingRequests();
    await migrateSettings();
    
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 ¡Migración completada exitosamente!');
    
  } catch (error) {
    console.error('\n❌ Error en la migración:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

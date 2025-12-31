/**
 * Script para sincronizar dispositivos de wallet y mensajes de notificación
 * desde Firebase a PostgreSQL
 * Ejecutar: node scripts/sync-wallet-devices.js
 */

import { PrismaClient } from '@prisma/client';
import { firestore } from '../lib/firebase.js';

const prisma = new PrismaClient();

async function syncAppleDevices() {
  console.log('\n🍎 Sincronizando dispositivos Apple Wallet...\n');
  
  const snapshot = await firestore.collection('apple_devices').get();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    try {
      // Firebase usa snake_case: device_id, push_token, pass_type_id, serial_number
      const deviceId = data.device_id || data.deviceId;
      const pushToken = data.push_token || data.pushToken;
      const passTypeId = data.pass_type_id || data.passTypeId;
      const serialNumber = data.serial_number || data.serialNumber;
      
      // Verificar campos requeridos
      if (!deviceId || !passTypeId || !serialNumber) {
        console.log(`  ⚠️ Dispositivo ${doc.id} sin campos requeridos, saltando...`);
        skipped++;
        continue;
      }
      
      // Buscar si ya existe
      const existing = await prisma.appleDevice.findFirst({
        where: {
          deviceId: deviceId,
          passTypeId: passTypeId,
          serialNumber: serialNumber
        }
      });
      
      if (existing) {
        // Actualizar pushToken si cambió
        if (pushToken && pushToken !== existing.pushToken) {
          await prisma.appleDevice.update({
            where: { id: existing.id },
            data: { pushToken: pushToken }
          });
          console.log(`  ✅ Actualizado: ${serialNumber} (${deviceId.slice(0, 8)}...)`);
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Crear nuevo
        await prisma.appleDevice.create({
          data: {
            deviceId: deviceId,
            pushToken: pushToken || '',
            passTypeId: passTypeId,
            serialNumber: serialNumber,
            createdAt: data.createdAt ? new Date(data.createdAt) : 
                       data.registered_at ? new Date(data.registered_at) : new Date()
          }
        });
        console.log(`  ✅ Creado: ${serialNumber} (${deviceId.slice(0, 8)}...)`);
        created++;
      }
    } catch (error) {
      console.error(`  ❌ Error en dispositivo ${doc.id}:`, error.message);
    }
  }
  
  console.log(`\n📊 Resumen Apple Devices:`);
  console.log(`  - Creados: ${created}`);
  console.log(`  - Actualizados: ${updated}`);
  console.log(`  - Sin cambios: ${skipped}`);
  console.log(`  - Total en Firebase: ${snapshot.docs.length}`);
}

async function syncGoogleDevices() {
  console.log('\n🤖 Sincronizando dispositivos Google Wallet...\n');
  
  const snapshot = await firestore.collection('google_devices').get();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    try {
      // Verificar campos requeridos
      if (!data.card_id && !data.cardId) {
        console.log(`  ⚠️ Dispositivo ${doc.id} sin cardId, saltando...`);
        skipped++;
        continue;
      }
      
      const cardId = data.card_id || data.cardId;
      const objectId = data.object_id || data.objectId || cardId;
      
      // Buscar si ya existe
      const existing = await prisma.googleDevice.findFirst({
        where: {
          cardId: cardId,
          objectId: objectId
        }
      });
      
      if (existing) {
        skipped++;
      } else {
        // Crear nuevo
        await prisma.googleDevice.create({
          data: {
            cardId: cardId,
            objectId: objectId,
            createdAt: data.createdAt ? new Date(data.createdAt) : 
                       data.registered_at ? new Date(data.registered_at) : new Date()
          }
        });
        console.log(`  ✅ Creado: ${cardId} -> ${objectId}`);
        created++;
      }
    } catch (error) {
      console.error(`  ❌ Error en dispositivo ${doc.id}:`, error.message);
    }
  }
  
  console.log(`\n📊 Resumen Google Devices:`);
  console.log(`  - Creados: ${created}`);
  console.log(`  - Actualizados: ${updated}`);
  console.log(`  - Sin cambios: ${skipped}`);
  console.log(`  - Total en Firebase: ${snapshot.docs.length}`);
}

async function syncAppleUpdates() {
  console.log('\n📲 Sincronizando actualizaciones Apple Wallet...\n');
  
  const snapshot = await firestore.collection('apple_updates').get();
  let created = 0;
  let skipped = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    try {
      const serialNumber = data.serialNumber || data.serial_number;
      
      if (!serialNumber) {
        skipped++;
        continue;
      }
      
      // Buscar si ya existe
      const existing = await prisma.appleUpdate.findFirst({
        where: { serialNumber: serialNumber }
      });
      
      if (existing) {
        skipped++;
      } else {
        await prisma.appleUpdate.create({
          data: {
            serialNumber: serialNumber,
            updatedAt: data.updatedAt ? new Date(data.updatedAt) : 
                       data.updated_at ? new Date(data.updated_at) : new Date()
          }
        });
        console.log(`  ✅ Creado: ${serialNumber}`);
        created++;
      }
    } catch (error) {
      console.error(`  ❌ Error en update ${doc.id}:`, error.message);
    }
  }
  
  console.log(`\n📊 Resumen Apple Updates:`);
  console.log(`  - Creados: ${created}`);
  console.log(`  - Sin cambios: ${skipped}`);
  console.log(`  - Total en Firebase: ${snapshot.docs.length}`);
}

async function syncLatestMessages() {
  console.log('\n💬 Sincronizando mensajes de notificación (latestMessage)...\n');
  
  const snapshot = await firestore.collection('cards').get();
  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const latestMessage = data.latestMessage;
    
    if (!latestMessage) {
      skipped++;
      continue;
    }
    
    try {
      // Verificar si existe en PostgreSQL
      const existing = await prisma.card.findUnique({
        where: { id: doc.id }
      });
      
      if (!existing) {
        console.log(`  ⚠️ Card ${doc.id} no existe en PostgreSQL`);
        notFound++;
        continue;
      }
      
      // Actualizar solo si el mensaje está vacío o diferente
      if (!existing.latestMessage || existing.latestMessage !== latestMessage) {
        await prisma.card.update({
          where: { id: doc.id },
          data: { latestMessage }
        });
        console.log(`  ✅ ${data.name}: "${latestMessage.slice(0, 50)}${latestMessage.length > 50 ? '...' : ''}"`);
        updated++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`  ❌ Error en ${doc.id}:`, error.message);
    }
  }
  
  console.log(`\n📊 Resumen Latest Messages:`);
  console.log(`  - Actualizados: ${updated}`);
  console.log(`  - Sin cambios: ${skipped}`);
  console.log(`  - No encontrados: ${notFound}`);
  console.log(`  - Total en Firebase: ${snapshot.docs.length}`);
}

async function syncGiftCardRedeems() {
  console.log('\n🎁 Sincronizando canjes de gift cards...\n');
  
  const snapshot = await firestore.collection('gift_card_redeems').get();
  let created = 0;
  let skipped = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    try {
      if (!data.code) {
        skipped++;
        continue;
      }
      
      // Buscar si ya existe
      const existing = await prisma.giftCardRedeem.findUnique({
        where: { id: doc.id }
      });
      
      if (existing) {
        skipped++;
      } else {
        await prisma.giftCardRedeem.create({
          data: {
            id: doc.id,
            code: data.code,
            service: data.service || null,
            clientName: data.clientName || data.client_name || null,
            expiryDate: data.expiryDate || data.expiry_date || null,
            redeemedAt: data.redeemedAt ? new Date(data.redeemedAt) : 
                        data.redeemed_at ? new Date(data.redeemed_at) : new Date(),
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
          }
        });
        console.log(`  ✅ Creado: ${data.code} - ${data.service || 'Sin servicio'}`);
        created++;
      }
    } catch (error) {
      console.error(`  ❌ Error en redeem ${doc.id}:`, error.message);
    }
  }
  
  console.log(`\n📊 Resumen Gift Card Redeems:`);
  console.log(`  - Creados: ${created}`);
  console.log(`  - Sin cambios: ${skipped}`);
  console.log(`  - Total en Firebase: ${snapshot.docs.length}`);
}

async function main() {
  console.log('🚀 Iniciando sincronización de dispositivos y notificaciones...\n');
  console.log('=' .repeat(60));
  
  try {
    await prisma.$connect();
    console.log('✅ Conectado a PostgreSQL\n');
    
    // Sincronizar todo lo relacionado con wallets y notificaciones
    await syncAppleDevices();
    await syncGoogleDevices();
    await syncAppleUpdates();
    await syncLatestMessages();
    await syncGiftCardRedeems();
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 ¡Sincronización completada exitosamente!');
    
  } catch (error) {
    console.error('\n❌ Error en la sincronización:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

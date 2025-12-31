/**
 * Script para sincronizar fechas de cumpleaños de Firebase a PostgreSQL
 * Firebase usa 'birthdate', PostgreSQL usa 'birthday'
 * Ejecutar: node scripts/sync-birthdays.js
 */

import { PrismaClient } from '@prisma/client';
import { firestore } from '../lib/firebase.js';

const prisma = new PrismaClient();

async function syncBirthdays() {
  console.log('\n🎂 Sincronizando fechas de cumpleaños...\n');
  
  const snapshot = await firestore.collection('cards').get();
  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    // Firebase puede tener 'birthdate' o 'birthday'
    const birthday = data.birthdate || data.birthday;
    
    if (!birthday) {
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
      
      // Actualizar solo si el birthday está vacío o diferente
      if (!existing.birthday || existing.birthday !== birthday) {
        await prisma.card.update({
          where: { id: doc.id },
          data: { birthday }
        });
        console.log(`  ✅ ${data.name}: ${birthday}`);
        updated++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`  ❌ Error en ${doc.id}:`, error.message);
    }
  }
  
  console.log(`\n📊 Resumen:`);
  console.log(`  - Actualizados: ${updated}`);
  console.log(`  - Sin cambios: ${skipped}`);
  console.log(`  - No encontrados: ${notFound}`);
  console.log(`  - Total en Firebase: ${snapshot.docs.length}`);
}

async function main() {
  try {
    await syncBirthdays();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();

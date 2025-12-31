/**
 * Migrar admins de Firebase a PostgreSQL
 */
import { PrismaClient } from '@prisma/client';
import { firestore } from '../lib/firebase.js';

const prisma = new PrismaClient();

async function main() {
  console.log('👤 Migrando administradores...\n');

  try {
    await prisma.$connect();

    const snapshot = await firestore.collection('admins').get();
    console.log(`Encontrados ${snapshot.docs.length} admins en Firebase`);

    for (const doc of snapshot.docs) {
      const data = doc.data();
      try {
        await prisma.admin.upsert({
          where: { id: doc.id },
          update: {},
          create: {
            id: doc.id,
            email: data.email,
            pass_hash: data.pass_hash,
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
            updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
          }
        });
        console.log(`  ✅ ${data.email}`);
      } catch (error) {
        console.error(`  ❌ Error en ${doc.id}:`, error.message);
      }
    }

    console.log('\n✅ Migración de admins completada!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

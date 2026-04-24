// Script para eliminar el servicio "Depilacion (General)" de la base de datos
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Buscar el servicio
  const services = await prisma.service.findMany({
    where: {
      name: { contains: 'Depilacion (General)', mode: 'insensitive' }
    }
  });

  if (services.length === 0) {
    console.log('❌ No se encontró el servicio "Depilacion (General)"');
    
    // Buscar también en Firestore/compat
    console.log('\nListando todos los servicios con "Depilacion" en el nombre:');
    const all = await prisma.service.findMany({
      where: { name: { contains: 'Depilacion', mode: 'insensitive' } }
    });
    all.forEach(s => console.log(`  - [${s.id}] ${s.name} (active: ${s.isActive})`));
  } else {
    for (const s of services) {
      console.log(`🗑️ Eliminando: [${s.id}] ${s.name}`);
      await prisma.service.delete({ where: { id: s.id } });
      console.log(`✅ Eliminado`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

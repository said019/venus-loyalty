/**
 * Script para diagnosticar el caso de Andrea Lizbeth Duran Hernandez
 */
import { prisma } from '../src/db/index.js';

async function checkAndrea() {
  console.log('🔍 Buscando información de Andrea Lizbeth Duran Hernandez...\n');

  // 1. Buscar tarjetas por nombre
  const cardsByName = await prisma.card.findMany({
    where: {
      name: { contains: 'Andrea', mode: 'insensitive' }
    }
  });

  console.log(`📇 Tarjetas con "Andrea" en el nombre (${cardsByName.length}):`);
  for (const c of cardsByName) {
    console.log(`  ID: ${c.id} | Nombre: ${c.name} | Teléfono: ${c.phone} | Sellos: ${c.stamps} | Estado: ${c.status}`);
  }

  // 2. Buscar tarjeta con número de la cita
  const cardCita = await prisma.card.findFirst({ where: { phone: '4271049064' } });
  console.log(`\n📱 Tarjeta con número de la cita (4271049064):`);
  if (cardCita) {
    console.log(`  ID: ${cardCita.id} | Nombre: ${cardCita.name} | Teléfono: ${cardCita.phone}`);
  } else {
    console.log('  No encontrada');
  }

  // 3. Buscar tarjeta con número correcto de Andrea
  const cardAndrea = await prisma.card.findFirst({ where: { phone: '4271363711' } });
  console.log(`\n📱 Tarjeta con número de Andrea (4271363711):`);
  if (cardAndrea) {
    console.log(`  ID: ${cardAndrea.id} | Nombre: ${cardAndrea.name} | Teléfono: ${cardAndrea.phone}`);
  } else {
    console.log('  No encontrada');
  }

  // 4. Buscar citas vinculadas al número de la cita
  const apptsCita = await prisma.appointment.findMany({
    where: { clientPhone: '4271049064' },
    orderBy: { startDateTime: 'desc' },
    take: 5
  });

  console.log(`\n📅 Citas con número 4271049064 (${apptsCita.length}):`);
  for (const a of apptsCita) {
    console.log(`  ID: ${a.id} | Cliente: ${a.clientName} | Servicio: ${a.serviceName} | Fecha: ${a.date} ${a.time} | Estado: ${a.status}`);
  }

  // 5. Buscar citas de Andrea por nombre
  const apptsAndrea = await prisma.appointment.findMany({
    where: { clientName: { contains: 'Andrea', mode: 'insensitive' } },
    orderBy: { startDateTime: 'desc' },
    take: 5
  });

  console.log(`\n📅 Citas con "Andrea" en el nombre (${apptsAndrea.length}):`);
  for (const a of apptsAndrea) {
    console.log(`  ID: ${a.id} | Cliente: ${a.clientName} | Teléfono: ${a.clientPhone} | Servicio: ${a.serviceName} | Fecha: ${a.date} ${a.time} | Estado: ${a.status}`);
  }

  await prisma.$disconnect();
}

checkAndrea().catch(console.error);

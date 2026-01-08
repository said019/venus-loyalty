/**
 * Script para eliminar todas las citas canceladas
 */

import { prisma } from '../src/db/index.js';

async function deleteCancelledAppointments() {
  console.log('🗑️  Eliminando citas canceladas...\n');

  try {
    // Primero contar cuántas hay
    const count = await prisma.appointment.count({
      where: { status: 'cancelled' }
    });

    console.log(`📊 Se encontraron ${count} citas canceladas\n`);

    if (count === 0) {
      console.log('✅ No hay citas canceladas para eliminar');
      await prisma.$disconnect();
      return;
    }

    // Mostrar cuáles se van a eliminar
    const cancelled = await prisma.appointment.findMany({
      where: { status: 'cancelled' },
      select: {
        id: true,
        clientName: true,
        serviceName: true,
        date: true,
        time: true
      },
      orderBy: { date: 'asc' }
    });

    console.log('Citas a eliminar:');
    cancelled.forEach(appt => {
      console.log(`  • ${appt.clientName} - ${appt.serviceName} - ${appt.date} ${appt.time}`);
    });
    console.log('');

    // Eliminar todas las citas canceladas
    const result = await prisma.appointment.deleteMany({
      where: { status: 'cancelled' }
    });

    console.log(`✅ Se eliminaron ${result.count} citas canceladas correctamente\n`);

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

deleteCancelledAppointments();

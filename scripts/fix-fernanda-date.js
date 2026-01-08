/**
 * Script para corregir la fecha de la cita de Fernanda Segundo Rodriguez
 */

import { prisma } from '../src/db/index.js';

async function fixFernandaAppointment() {
  console.log('🔧 Corrigiendo cita de Fernanda Segundo Rodriguez...\n');

  try {
    // Update the appointment to correct date
    const updated = await prisma.appointment.update({
      where: { id: 'iIZM4IcGqjJFiHgkvK7M' },
      data: {
        date: '2026-01-08',
        startDateTime: new Date('2026-01-09T01:00:00.000Z'), // Jan 8 7PM Mexico = Jan 9 1AM UTC
        endDateTime: new Date('2026-01-09T02:00:00.000Z')    // Jan 8 8PM Mexico = Jan 9 2AM UTC
      }
    });

    console.log('✅ Cita actualizada:');
    console.log('   ID:', updated.id);
    console.log('   Cliente:', updated.clientName);
    console.log('   Fecha (campo date):', updated.date);
    console.log('   Hora (campo time):', updated.time);
    console.log('   startDateTime (UTC):', updated.startDateTime.toISOString());
    console.log('   endDateTime (UTC):', updated.endDateTime.toISOString());

    // Verify in Mexico timezone
    const mexicoStart = updated.startDateTime.toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      dateStyle: 'full',
      timeStyle: 'short'
    });
    console.log('   Fecha/hora en México:', mexicoStart);
    console.log('\n✅ La cita ahora está correctamente para el 8 de enero a las 7 PM');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixFernandaAppointment();

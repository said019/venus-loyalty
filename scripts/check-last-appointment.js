/**
 * Script para verificar la última cita creada
 */

import { prisma } from '../src/db/index.js';

async function checkLastAppointment() {
  const appts = await prisma.appointment.findMany({
    where: {
      clientName: 'Said Romero',
      date: '2026-01-08'
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('Últimas 5 citas de Said Romero para 2026-01-08:\n');
  appts.forEach((appt, i) => {
    console.log(`${i + 1}. ID: ${appt.id}`);
    console.log(`   Cliente: ${appt.clientName}`);
    console.log(`   Servicio: ${appt.serviceName}`);
    console.log(`   date (campo): ${appt.date}`);
    console.log(`   time (campo): ${appt.time}`);
    console.log(`   startDateTime (UTC): ${appt.startDateTime.toISOString()}`);

    // Convertir a México
    const mexicoTime = new Date(appt.startDateTime.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    console.log(`   startDateTime (México via toLocaleString): ${mexicoTime.toLocaleString()}`);

    // Conversión manual UTC-6
    const utcHours = appt.startDateTime.getUTCHours();
    const utcMinutes = appt.startDateTime.getUTCMinutes();
    let mexicoHours = utcHours - 6;
    if (mexicoHours < 0) mexicoHours += 24;
    console.log(`   Conversión manual UTC-6: ${mexicoHours.toString().padStart(2, '0')}:${utcMinutes.toString().padStart(2, '0')}`);

    console.log(`   Creada: ${appt.createdAt.toISOString()}`);
    console.log('');
  });

  await prisma.$disconnect();
}

checkLastAppointment();

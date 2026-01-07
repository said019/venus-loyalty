/**
 * Test de endpoints de appointments refactorizados
 */

import { AppointmentsRepo, CardsRepo } from '../src/db/repositories.js';

async function testEndpoints() {
  console.log('🧪 Probando endpoints refactorizados...\n');

  try {
    // Test 1: GET /api/appointments/month
    console.log('1️⃣ Test GET /api/appointments/month');
    const year = 2026;
    const month = 1;
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const from = `${firstDay}T00:00:00-06:00`;
    const to = `${lastDayStr}T23:59:59-06:00`;

    const monthData = await AppointmentsRepo.findByDateRange(from, to);
    console.log(`   ✅ Encontradas ${monthData.length} citas en enero 2026`);

    // Test 2: GET /api/appointments?date
    console.log('\n2️⃣ Test GET /api/appointments?date');
    const date = '2026-01-08'; // Fecha con citas
    const dayData = await AppointmentsRepo.findByDate(date);
    console.log(`   ✅ Encontradas ${dayData.length} citas para ${date}`);

    if (dayData.length > 0) {
      console.log('   Primera cita:', {
        cliente: dayData[0].clientName,
        servicio: dayData[0].serviceName,
        hora: dayData[0].time
      });
    }

    // Test 3: GET /api/appointments/:id
    console.log('\n3️⃣ Test GET /api/appointments/:id');
    if (monthData.length > 0) {
      const appointmentId = monthData[0].id;
      const appointment = await AppointmentsRepo.findById(appointmentId);
      console.log(`   ✅ Cita encontrada:`, {
        id: appointment.id,
        cliente: appointment.clientName,
        servicio: appointment.serviceName,
        fecha: appointment.date,
        hora: appointment.time
      });
    }

    // Test 4: Verificar que las tarjetas funcionan
    console.log('\n4️⃣ Test CardsRepo.findByPhone');
    const testPhone = '4441234567';
    const card = await CardsRepo.findByPhone(testPhone);
    if (card) {
      console.log(`   ✅ Tarjeta encontrada: ${card.name} - ${card.phone}`);
    } else {
      console.log(`   ℹ️  No existe tarjeta para ${testPhone}`);
    }

    console.log('\n✅ Todos los tests pasaron correctamente\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error en tests:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testEndpoints();

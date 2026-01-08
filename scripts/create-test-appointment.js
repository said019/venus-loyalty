/**
 * Script para crear una cita de prueba y enviar WhatsApp
 */

import { AppointmentsRepo, CardsRepo } from '../src/db/repositories.js';
import { WhatsAppService } from '../src/services/whatsapp-v2.js';

async function createTestAppointment() {
  console.log('📝 Creando cita de prueba para Said Romero...\n');

  try {
    const phone = '4442757136';
    const name = 'Said Romero';

    // Buscar o crear tarjeta
    let card = await CardsRepo.findByPhone(phone);

    if (!card) {
      console.log('Creando nueva tarjeta...');
      card = await CardsRepo.create({
        name,
        phone,
        email: null,
        birthday: null,
        stamps: 0,
        max: 8,
        cycles: 0,
        status: 'active',
        source: 'test-script'
      });
      console.log(`✅ Tarjeta creada: ${card.id}\n`);
    } else {
      console.log(`✅ Tarjeta encontrada: ${card.id}\n`);
    }

    // Crear cita para mañana a las 11:00 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = '11:00';

    const appointmentData = {
      cardId: card.id,
      clientName: name,
      clientPhone: phone,
      serviceId: null,
      serviceName: 'Prueba de WhatsApp',
      date: dateStr,
      time: time,
      durationMinutes: 60,
      status: 'scheduled',
      location: 'Venus Cosmetología',
      source: 'test-script',
      sendWhatsApp24h: true,
      sendWhatsApp2h: true
    };

    console.log('Datos de la cita:');
    console.log(`  Fecha: ${dateStr}`);
    console.log(`  Hora: ${time}`);
    console.log(`  Servicio: ${appointmentData.serviceName}\n`);

    const appointment = await AppointmentsRepo.create(appointmentData);

    console.log('✅ Cita creada:');
    console.log(`  ID: ${appointment.id}`);
    console.log(`  date: ${appointment.date}`);
    console.log(`  time: ${appointment.time}`);
    console.log(`  startDateTime: ${appointment.startDateTime.toISOString()}`);
    console.log('');

    // Enviar WhatsApp
    console.log('📤 Enviando mensaje de WhatsApp...\n');
    const result = await WhatsAppService.sendConfirmation(appointment);

    if (result.success) {
      console.log('✅ WhatsApp enviado exitosamente!');
      console.log(`   Message SID: ${result.messageSid}`);
      console.log('\n📱 Revisa tu teléfono para verificar que la hora sea correcta (11:00)\n');
    } else {
      console.log('❌ Error enviando WhatsApp:', result.error);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createTestAppointment();

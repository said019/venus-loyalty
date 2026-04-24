// test-cancelacion-whatsapp.js
// Script para probar la cancelación por WhatsApp

import { firestore } from './lib/firebase.js';

/**
 * Simula una cancelación por WhatsApp
 * Uso: node test-cancelacion-whatsapp.js <appointmentId>
 */
async function testCancelacion() {
    try {
        const appointmentId = process.argv[2];

        if (!appointmentId) {
            console.error('❌ Uso: node test-cancelacion-whatsapp.js <appointmentId>');
            console.log('\nPara obtener un ID de cita:');
            console.log('1. Abre el dashboard');
            console.log('2. Ve al tab "Citas"');
            console.log('3. Inspecciona el botón "Cancelar" de una cita');
            console.log('4. Copia el ID que aparece en onclick="cancelAppointment(\'ID_AQUI\')"');
            process.exit(1);
        }

        console.log(`\n🔍 Buscando cita: ${appointmentId}`);

        // Obtener la cita
        const apptDoc = await firestore.collection('appointments').doc(appointmentId).get();

        if (!apptDoc.exists) {
            console.error(`❌ No se encontró la cita con ID: ${appointmentId}`);
            process.exit(1);
        }

        const cita = { id: apptDoc.id, ...apptDoc.data() };

        console.log('\n📋 Datos de la cita:');
        console.log(`   Cliente: ${cita.clientName}`);
        console.log(`   Teléfono: ${cita.clientPhone}`);
        console.log(`   Servicio: ${cita.serviceName}`);
        console.log(`   Fecha: ${cita.startDateTime}`);
        console.log(`   Status actual: ${cita.status}`);
        console.log(`   Calendar Event 1: ${cita.googleCalendarEventId || 'N/A'}`);
        console.log(`   Calendar Event 2: ${cita.googleCalendarEventId2 || 'N/A'}`);

        if (cita.status === 'cancelled') {
            console.log('\n⚠️  Esta cita ya está cancelada');
            process.exit(0);
        }

        console.log('\n❌ Simulando cancelación por WhatsApp...\n');

        // Importar funciones necesarias
        const { deleteEvent } = await import('./src/services/googleCalendarService.js');
        const { config } = await import('./src/config/config.js');
        const { WhatsAppService } = await import('./src/services/whatsapp.js');

        // 1. Cancelar en Firestore
        console.log('1️⃣  Cancelando en Firestore...');
        await firestore.collection('appointments').doc(cita.id).update({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledVia: 'whatsapp_test'
        });
        console.log('   ✅ Cancelada en Firestore');

        // 2. Eliminar de Google Calendar
        console.log('\n2️⃣  Eliminando de Google Calendar...');
        
        if (cita.googleCalendarEventId) {
            try {
                await deleteEvent(cita.googleCalendarEventId, config.google.calendarOwner1);
                console.log(`   ✅ Evento eliminado del calendar 1: ${cita.googleCalendarEventId}`);
            } catch (err) {
                console.error(`   ❌ Error eliminando del calendar 1: ${err.message}`);
            }
        } else {
            console.log('   ⏭️  No hay evento en calendar 1');
        }

        if (cita.googleCalendarEventId2) {
            try {
                await deleteEvent(cita.googleCalendarEventId2, config.google.calendarOwner2);
                console.log(`   ✅ Evento eliminado del calendar 2: ${cita.googleCalendarEventId2}`);
            } catch (err) {
                console.error(`   ❌ Error eliminando del calendar 2: ${err.message}`);
            }
        } else {
            console.log('   ⏭️  No hay evento en calendar 2');
        }

        // 3. Crear notificación
        console.log('\n3️⃣  Creando notificación...');
        await firestore.collection('notifications').add({
            type: 'alerta',
            icon: 'calendar-times',
            title: 'Cita cancelada (TEST)',
            message: `${cita.clientName} canceló ${cita.serviceName}`,
            read: false,
            createdAt: new Date().toISOString(),
            entityId: cita.id
        });
        console.log('   ✅ Notificación creada');

        // 4. Enviar WhatsApp (opcional - comentado para no enviar en pruebas)
        console.log('\n4️⃣  Enviando confirmación por WhatsApp...');
        console.log('   ⏭️  Saltado (descomenta para enviar realmente)');
        // const whatsappResult = await WhatsAppService.sendCancelacionConfirmada(cita);
        // if (whatsappResult.success) {
        //     console.log(`   ✅ WhatsApp enviado: ${whatsappResult.messageSid}`);
        // } else {
        //     console.log(`   ❌ Error enviando WhatsApp: ${whatsappResult.error}`);
        // }

        console.log('\n✅ ¡Cancelación completada exitosamente!\n');
        console.log('📊 Verifica en:');
        console.log('   1. Dashboard → Tab "Citas" (se actualizará en 30 seg)');
        console.log('   2. Google Calendar (Said y Alondra)');
        console.log('   3. Dashboard → Notificaciones\n');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error en la prueba:', error);
        process.exit(1);
    }
}

// Ejecutar
testCancelacion();

// tests/confirmacionMultiple.test.js
// Run: node --test tests/confirmacionMultiple.test.js
//
// Bug real (11 jul 2026, María de los Angeles): el acuse consolidado de
// confirmación ponía UNA sola fecha en el encabezado (la de la primera cita)
// aunque las citas confirmadas fueran de días distintos → "Confirmamos tus
// citas para el 11 de julio" incluyendo una cita que no era de ese día.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfirmacionRecibidaMultipleMensaje } from '../src/services/whatsapp-v2.js';

const citaHoy = {
    clientName: 'María de los Angeles Mendez Perez',
    clientPhone: '5214271234567',
    serviceName: 'Depilación Axila y Despigmantante',
    date: '2026-07-11',
    time: '12:00'
};
const citaOtroDia = {
    clientName: 'María de los Angeles Mendez Perez',
    clientPhone: '5214271234567',
    serviceName: 'Limpieza Profunda',
    date: '2026-07-18',
    time: '15:00'
};

test('mismo día: una sola fecha en el encabezado y horas en las líneas', () => {
    const msg = buildConfirmacionRecibidaMultipleMensaje([
        { ...citaOtroDia, date: '2026-07-11', time: '15:00' },
        citaHoy
    ]);
    assert.match(msg, /Confirmamos tus citas para el \*11 de julio\*/);
    assert.match(msg, /Depilación Axila y Despigmantante\* a las \*12:00\*/);
    assert.match(msg, /Limpieza Profunda\* a las \*15:00\*/);
    // Orden por hora
    assert.ok(msg.indexOf('12:00') < msg.indexOf('15:00'));
});

test('días distintos: cada cita lleva SU fecha y el encabezado no fija una', () => {
    const msg = buildConfirmacionRecibidaMultipleMensaje([citaOtroDia, citaHoy]);
    // El encabezado no debe amarrar todo a una sola fecha
    assert.doesNotMatch(msg, /Confirmamos tus citas para el/);
    // Cada línea con su fecha
    assert.match(msg, /Depilación Axila y Despigmantante\*.*11 de julio.*\*12:00\*/);
    assert.match(msg, /Limpieza Profunda\*.*18 de julio.*\*15:00\*/);
    // Orden cronológico: la de hoy antes que la de la próxima semana
    assert.ok(msg.indexOf('11 de julio') < msg.indexOf('18 de julio'));
});

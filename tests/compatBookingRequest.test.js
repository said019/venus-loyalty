// tests/compatBookingRequest.test.js
// Run: node --test tests/compatBookingRequest.test.js
//
// Bug real (17 jul 2026, "Alicia"): el flujo público de agendado construye
// requestData con campos de preorden/anticipo (feat 08c319a) que NUNCA
// existieron en el modelo Prisma BookingRequest → prisma.bookingRequest.create()
// tronaba con "Unknown argument" y NINGUNA clienta podía mandar solicitud.
// Esos campos sí se usan para el WhatsApp/email del admin, así que se filtran
// SOLO al persistir (processDataForUpdate), no en el objeto en memoria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { processDataForUpdate } from '../src/db/compat.js';

const requestData = {
    serviceId: '6TqE3Lvl7TePOQYot8Go',
    serviceName: 'Skin Analyzer + Facial Personalizado',
    servicePrice: 800,
    serviceDuration: 90,
    date: '2026-07-21',
    time: '15:00',
    clientName: 'Alicia',
    clientPhone: '4272884083',
    clientEmail: null,
    cardId: 'card_1784310924176',
    isNewClient: false,
    status: 'pending',
    createdAt: '2026-07-17T18:46:00.000Z',
    preorderItems: [],
    preorderSubtotal: 0,
    discountPct: 0,
    discountAmount: 0,
    finalServicePrice: 800,
    depositReceiptUrl: null,
    depositAmount: 0,
    depositStatus: 'pending',
};

test('bookingRequest: los campos de preorden/anticipo NO llegan a Prisma', () => {
    const out = processDataForUpdate('bookingRequest', requestData);
    for (const campo of ['preorderItems', 'preorderSubtotal', 'discountPct', 'discountAmount',
        'finalServicePrice', 'depositReceiptUrl', 'depositAmount', 'depositStatus']) {
        assert.equal(campo in out, false, `el campo ${campo} debe filtrarse antes del create`);
    }
});

test('bookingRequest: los campos reales del modelo se conservan', () => {
    const out = processDataForUpdate('bookingRequest', requestData);
    assert.equal(out.serviceName, 'Skin Analyzer + Facial Personalizado');
    assert.equal(out.clientName, 'Alicia');
    assert.equal(out.cardId, 'card_1784310924176');
    assert.equal(out.isNewClient, false);
    assert.equal(out.status, 'pending');
});

test('bookingRequest: el objeto original NO se muta (el WhatsApp del admin lo necesita completo)', () => {
    processDataForUpdate('bookingRequest', requestData);
    assert.equal(requestData.depositStatus, 'pending');
    assert.equal(requestData.finalServicePrice, 800);
});

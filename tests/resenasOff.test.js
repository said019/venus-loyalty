// tests/resenasOff.test.js
// Run: node --test tests/resenasOff.test.js
//
// Regresión estática del spec 2026-07-16-desactivar-mensaje-resenas-design.md:
// el mensaje de evaluación/reseña post-cita está APAGADO por decisión de Said
// (17-jul-2026). Si alguien reactiva el interruptor o quita el gate del cron,
// este test truena para que sea una decisión consciente, no un accidente.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/scheduler/cron.js', 'utf8');

test('el interruptor de reseñas existe y está apagado', () => {
    assert.match(src, /const RESENAS_AUTO_ACTIVAS = false;/,
        'RESENAS_AUTO_ACTIVAS debe existir y valer false (decisión Said 17-jul-2026)');
});

test('el cron de reseñas sale ANTES de consultar citas o enviar mensajes', () => {
    const bloque = src.split('ENVÍO DE LINK DE EVALUACIÓN POST-CITA')[1];
    assert.ok(bloque, 'el bloque del cron de evaluación debe existir');
    const gate = bloque.indexOf('if (!RESENAS_AUTO_ACTIVAS) return;');
    const query = bloque.indexOf('findMany');
    assert.ok(gate !== -1, 'el gate del interruptor debe estar en el cron de reseñas');
    assert.ok(query === -1 || gate < query,
        'el gate debe ejecutarse antes de la consulta findMany de citas');
});

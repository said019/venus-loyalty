import test from 'node:test';
import assert from 'node:assert/strict';
import { prefillFromIntake } from '../src/services/ai/skinAdvisor/intakePrefill.js';
import { ANSWER_FIELDS } from '../src/services/ai/skinAdvisor/catalog.js';

const full = {
  skinCondition: 'Brillo en zona T', conditionSince: 'Hace 2 años', previousTreatments: 'Limpieza facial', treatmentReactions: 'Enrojecimiento',
  routineDay: ['Limpiador', 'Protector'], routineNight: ['Crema'],
  interestData: { alergias: { value: true, detail: 'Níquel' }, medicamentos: { value: true, detail: 'Ninguno relevante' }, protectorSolar: { value: true, detail: 'FPS 50' } },
};

test('complete intake maps to answer fields', () => {
  const out = prefillFromIntake(full);
  assert.deepEqual(out, { symptoms: 'Brillo en zona T', duration: 'Hace 2 años', previousTreatments: 'Limpieza facial', reactions: 'Enrojecimiento', routineDay: 'Limpiador, Protector', routineNight: 'Crema', allergies: 'Níquel', medications: 'Ninguno relevante', sunscreen: 'FPS 50' });
  for (const key of Object.keys(out)) assert.ok(ANSWER_FIELDS.includes(key));
});

test('falsy interest values drop allergies and medications', () => {
  const out = prefillFromIntake({ ...full, interestData: { alergias: { value: false, detail: 'Níquel' }, medicamentos: { value: false, detail: 'x' }, protectorSolar: { value: false, detail: '' } } });
  assert.equal('allergies' in out, false);
  assert.equal('medications' in out, false);
  assert.equal(out.sunscreen, 'No');
});

test('empty arrays, blanks and null intake yield no keys', () => {
  assert.deepEqual(prefillFromIntake({ skinCondition: '  ', routineDay: [], routineNight: [] }), {});
  assert.deepEqual(prefillFromIntake(null), {});
});

test('long text is trimmed and capped at 500 chars', () => {
  assert.equal(prefillFromIntake({ skinCondition: ' ' + 'a'.repeat(600) }).symptoms.length, 500);
});

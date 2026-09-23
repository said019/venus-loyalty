import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { prepareContext } from '../src/services/ai/skinAdvisor/context.js';
import { validateAssessment } from '../src/services/ai/skinAdvisor/contract.js';
import { makeInput, makeAssessment } from './fixtures/skin-advisor.js';

test('full-face evidence supports visible regions but never unconfirmed laterality', async () => {
  const input = await makeInput();
  input.photos[0].zone = 'full_face';
  input.photos[0].lateralityResolved = false;
  const context = await prepareContext(input);
  const result = makeAssessment(context);
  result.observations[0].zone = 'forehead';
  assert.equal(validateAssessment(result, context), true);
  result.observations[0].zone = 'left_eye';
  assert.throws(() => validateAssessment(result, context), { code: 'invalid_assessment' });
  input.photos[0].lateralityResolved = true;
  assert.equal(validateAssessment(result, await prepareContext(input)), true);
});

test('partial-region evidence cannot be relabeled as full-face evidence', async () => {
  const context = await prepareContext(await makeInput());
  const result = makeAssessment(context);
  result.observations[0].zone = 'full_face';
  assert.throws(() => validateAssessment(result, context), { code: 'invalid_assessment' });
});

test('native report stays compatible with Android, private, CSP-safe and independent from manufacturer', () => {
  const source = fs.readFileSync(new URL('../public/skin-photo-report.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotMatch(source, /\?\.|\?\?|innerHTML|yiyuan|skin-analysis\/|\.style\./);
  assert.match(source, /row\.status === 'approved' && !simulated/);
  assert.match(source, /photo\.sourceUrl/);
  assert.match(source, /lateralityResolved/);
});

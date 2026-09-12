import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANSWER_FIELDS,
  AREAS,
  OUTPUT_SCHEMA,
  ZONES,
  createAdvisorSession,
  createOpenAIProvider,
  prepareContext,
  validateAssessment,
} from '../src/services/ai/skinAdvisor/index.js';
import { makeAssessment, makeInput } from './fixtures/skin-advisor.js';

const responseOf = (value, overrides = {}) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({
    status: 'completed',
    output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
    ...overrides,
  }),
});

const errorCode = async (operation, code) => {
  await assert.rejects(operation, (error) => error?.code === code && !/secret|photo-fictional/i.test(error.message));
};

test('catalog exposes exactly the bounded thirteen analysis areas', () => {
  assert.equal(AREAS.length, 13);
  assert.deepEqual(AREAS.map(({ id }) => id), Array.from({ length: 13 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`));
  assert.ok(AREAS.every((area) => area.label && area.scope && area.limit));
  assert.ok(ZONES.includes('unknown'));
  assert.ok(ANSWER_FIELDS.includes('changingLesion'));
});

test('prepareContext whitelists answers, normalizes empties to null, and detaches caller data', async () => {
  const input = await makeInput({ answers: { duration: '  ', arbitraryChartDump: 'SECRET' } });
  const originalBytes = Buffer.from(input.photos[0].bytes);
  const context = await prepareContext(input);

  assert.equal(context.answers.duration, null);
  assert.equal(context.answers.arbitraryChartDump, undefined);
  assert.equal(context.patient.name, undefined);
  assert.notEqual(context.photos[0].dataBase64, originalBytes.toString('base64'));
  input.answers.goal = 'mutated';
  input.photos[0].bytes.fill(0);
  assert.equal(context.answers.goal, 'Rutina sencilla');
  assert.equal(context.photos[0].mediaType, 'image/jpeg');
  assert.ok(Object.isFrozen(context));
});

test('prepareContext snapshots every caller-owned field before image decoding awaits', async () => {
  const input = await makeInput();
  const preparing = prepareContext(input);
  input.answers.goal = 'mutated during decode';
  input.photos[0].zone = 'nose';
  input.photos[0].mediaType = 'image/jpeg';
  input.consent.scope.photoIds.length = 0;
  const context = await preparing;
  assert.equal(context.answers.goal, 'Rutina sencilla');
  assert.equal(context.photos[0].zone, 'forehead');
  assert.deepEqual(context.consent.photoIds, ['photo-fictional-front']);
});

test('prepareContext rejects invalid types and non-finite ages without inventing defaults', async () => {
  await errorCode(() => makeInput({ patient: { age: Number.NaN } }).then(prepareContext), 'invalid_context');
  await errorCode(() => makeInput({ answers: { goal: 0 } }).then(prepareContext), 'invalid_context');
  const context = await prepareContext(await makeInput({ patient: { age: null, objective: '' }, answers: { allergies: '' } }));
  assert.equal(context.patient.age, null);
  assert.equal(context.patient.objective, null);
  assert.equal(context.answers.allergies, null);
});

test('photo validation rejects foreign ownership, MIME mismatch, unsupported bytes, and oversize input', async () => {
  const foreign = await makeInput();
  foreign.photos[0].recordId = 'different-record';
  await errorCode(() => prepareContext(foreign), 'photo_ownership');

  const mismatch = await makeInput();
  mismatch.photos[0].mediaType = 'image/jpeg';
  await errorCode(() => prepareContext(mismatch), 'photo_mismatch');

  const invalid = await makeInput();
  invalid.photos[0].bytes = Buffer.from('not an image');
  await errorCode(() => prepareContext(invalid), 'invalid_photo');

  const oversize = await makeInput();
  oversize.photos[0].bytes = Buffer.alloc(5 * 1024 * 1024 + 1);
  await errorCode(() => prepareContext(oversize), 'photo_too_large');

  const unresolved = await makeInput();
  unresolved.photos[0].zone = 'right_cheek';
  unresolved.photos[0].lateralityResolved = false;
  await errorCode(() => prepareContext(unresolved), 'unresolved_laterality');
});

test('specific OpenAI consent and activation are required and photo scope must match', async () => {
  await errorCode(() => makeInput({ consent: { accepted: false } }).then(prepareContext), 'consent_required');
  await errorCode(() => makeInput({ consent: { provider: 'general-photo' } }).then(prepareContext), 'consent_required');
  await errorCode(() => makeInput({ consent: { scope: { photoIds: [] } } }).then(prepareContext), 'consent_scope');
  await errorCode(() => makeInput({ activation: { enabled: false } }).then(prepareContext), 'activation_required');
});

test('disabled and missing-key providers fail before fetch and before context inspection', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; };
  const disabled = createOpenAIProvider({ enabled: false, apiKey: 'secret', fetch });
  await errorCode(() => disabled.generate({}), 'disabled');
  const missing = createOpenAIProvider({ enabled: true, apiKey: ' ', fetch });
  await errorCode(() => missing.generate({}), 'key_missing');
  assert.equal(calls, 0);
});

test('provider emits exact Responses API shape without tools or excluded record PII', async () => {
  const input = await makeInput({
    name: 'PERSON NAME SHOULD NOT LEAVE',
    phone: '+52 555 SECRET',
    address: 'SECRET ADDRESS',
    fullDob: '1992-01-01',
    signature: 'SECRET SIGNATURE',
    cardId: 'SECRET CARD',
  });
  const context = await prepareContext(input);
  let request;
  const provider = createOpenAIProvider({
    enabled: true,
    apiKey: 'test-api-key',
    model: 'gpt-6-astra',
    fetch: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return responseOf(makeAssessment(context));
    },
  });

  await provider.generate(context);
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.redirect, 'manual');
  assert.equal(request.body.store, false);
  assert.equal(request.body.model, 'gpt-6-astra');
  assert.deepEqual(request.body.text.format, {
    type: 'json_schema', name: 'venus_skin_assessment', strict: true, schema: OUTPUT_SCHEMA,
  });
  assert.equal('tools' in request.body, false);
  assert.equal(request.body.input[0].role, 'developer');
  assert.match(request.body.input[0].content[0].text, /Spanish/i);
  assert.equal(request.body.input[1].role, 'user');
  assert.match(request.body.input[1].content.at(-1).image_url, /^data:image\/jpeg;base64,/);
  const serialized = JSON.stringify(request.body);
  assert.doesNotMatch(serialized, /PERSON NAME|555 SECRET|SECRET ADDRESS|SECRET SIGNATURE|SECRET CARD|record-fictional/i);
});

test('provider accepts one completed valid output and rejects refusal or incomplete output', async () => {
  const context = await prepareContext(await makeInput());
  const valid = makeAssessment(context);
  const provider = (fetch) => createOpenAIProvider({ enabled: true, apiKey: 'key', fetch });
  assert.deepEqual(await provider(async () => responseOf(valid)).generate(context), valid);

  await errorCode(() => provider(async () => responseOf(valid, {
    output: [{ content: [{ type: 'refusal', refusal: 'no' }] }],
  })).generate(context), 'refused');
  await errorCode(() => provider(async () => responseOf(valid, { status: 'incomplete' })).generate(context), 'incomplete');
});

test('provider sanitizes non-2xx, network, malformed, missing, ambiguous, and extra-field outputs', async () => {
  const context = await prepareContext(await makeInput());
  const provider = (fetch) => createOpenAIProvider({ enabled: true, apiKey: 'key', fetch });
  await errorCode(() => provider(async () => ({ ok: false, status: 500, text: async () => 'provider secret details' })).generate(context), 'provider_http');
  await errorCode(() => provider(async () => { throw new Error('network leaked key'); }).generate(context), 'network');
  await errorCode(() => provider(async () => ({ ok: true, status: 200, text: async () => '{bad' })).generate(context), 'malformed_response');
  await errorCode(() => provider(async () => responseOf(makeAssessment(context), { output: [] })).generate(context), 'missing_output');
  await errorCode(() => provider(async () => responseOf(makeAssessment(context), {
    output: [{ content: [
      { type: 'output_text', text: JSON.stringify(makeAssessment(context)) },
      { type: 'output_text', text: JSON.stringify(makeAssessment(context)) },
    ] }],
  })).generate(context), 'ambiguous_output');
  const extra = { ...makeAssessment(context), globalHealthScore: 98 };
  await errorCode(() => provider(async () => responseOf(extra)).generate(context), 'invalid_assessment');
});

test('assessment validation enforces evidence, zone, protocol and array bounds', async () => {
  const context = await prepareContext(await makeInput());
  assert.equal(validateAssessment(makeAssessment(context), context), true);

  const unknownEvidence = structuredClone(makeAssessment(context));
  unknownEvidence.observations[0].evidence.photoIds = ['unknown-photo'];
  await errorCode(async () => validateAssessment(unknownEvidence, context), 'invalid_assessment');

  const wrongZone = structuredClone(makeAssessment(context));
  wrongZone.observations[0].zone = 'nose';
  await errorCode(async () => validateAssessment(wrongZone, context), 'invalid_assessment');

  const nullAnswer = structuredClone(makeAssessment(context));
  nullAnswer.observations[0].evidence.answerKeys = ['allergies'];
  await errorCode(async () => validateAssessment(nullAnswer, context), 'invalid_assessment');

  const badProtocol = structuredClone(makeAssessment(context));
  badProtocol.careDraft.options[0].protocolVersion = '999';
  await errorCode(async () => validateAssessment(badProtocol, context), 'invalid_assessment');

  const tooMany = structuredClone(makeAssessment(context));
  tooMany.followUpQuestions = Array(6).fill('Pregunta');
  await errorCode(async () => validateAssessment(tooMany, context), 'invalid_assessment');
  tooMany.followUpQuestions = [];
  tooMany.priorities = Array(4).fill(tooMany.priorities[0]);
  await errorCode(async () => validateAssessment(tooMany, context), 'invalid_assessment');
  const tooManyOptions = structuredClone(makeAssessment(context));
  tooManyOptions.careDraft.options = Array(4).fill(tooManyOptions.careDraft.options[0]);
  await errorCode(async () => validateAssessment(tooManyOptions, context), 'invalid_assessment');
});

test('assessment supports unknowns without clinical scores and lesion flags force review with no service options', async () => {
  const context = await prepareContext(await makeInput({ answers: { changingLesion: true } }));
  const result = makeAssessment(context);
  result.observations = [];
  result.priorities = [];
  result.careDraft.options = [];
  result.professionalReview = { required: true, reasons: ['Cambio declarado; derivar para revisión profesional.'] };
  assert.equal(validateAssessment(result, context), true);

  result.professionalReview.required = false;
  await errorCode(async () => validateAssessment(result, context), 'invalid_assessment');
  result.professionalReview.required = true;
  result.careDraft.options = [makeAssessment(context).careDraft.options[0]];
  await errorCode(async () => validateAssessment(result, context), 'invalid_assessment');
  assert.doesNotMatch(JSON.stringify(OUTPUT_SCHEMA), /confidence|biologicalAge|sebumPercent|hydrationPercent/i);
});

test('quality coverage cannot invent or omit supplied photo zones', async () => {
  const context = await prepareContext(await makeInput());
  const invented = makeAssessment(context);
  invented.quality.zones[0].zone = 'nose';
  await errorCode(async () => validateAssessment(invented, context), 'invalid_assessment');
  const omitted = makeAssessment(context);
  omitted.quality.zones = [];
  await errorCode(async () => validateAssessment(omitted, context), 'invalid_assessment');
});

test('provider timeout is hard and does not retry when fetch ignores abort', async () => {
  const context = await prepareContext(await makeInput());
  let calls = 0;
  const provider = createOpenAIProvider({
    enabled: true,
    apiKey: 'key',
    timeoutMs: 20,
    fetch: async () => {
      calls += 1;
      return new Promise(() => {});
    },
  });
  await errorCode(() => provider.generate(context), 'timeout');
  assert.equal(calls, 1);
});

test('session deduplicates an in-flight generation and creates server provenance', async () => {
  const input = await makeInput();
  let calls = 0;
  let resolve;
  const provider = {
    metadata: { provider: 'fixture', model: 'deterministic' },
    generate: async (context) => {
      calls += 1;
      return new Promise((done) => { resolve = () => done(makeAssessment(context)); });
    },
  };
  const session = createAdvisorSession({ provider, authorizeReview: () => true });
  await session.replaceInput(input);
  const first = session.generate();
  const second = session.generate();
  assert.equal(first, second);
  await new Promise((done) => setImmediate(done));
  resolve();
  const result = await first;
  assert.equal(calls, 1);
  assert.equal(result.status, 'pending_review');
  assert.equal(result.provenance.provider, 'fixture');
  assert.equal(result.provenance.inputFingerprint, result.inputVersion);
  assert.doesNotMatch(JSON.stringify(result), /bytes|dataBase64|apiKey/i);
});

test('replacing input invalidates results and suppresses late completion', async () => {
  let finishOld;
  const provider = {
    metadata: { provider: 'fixture', model: 'deterministic' },
    generate: (context) => new Promise((resolve) => { finishOld = () => resolve(makeAssessment(context)); }),
  };
  const session = createAdvisorSession({ provider, authorizeReview: () => true });
  await session.replaceInput(await makeInput());
  const oldVersion = session.snapshot().inputVersion;
  const pending = session.generate();
  await session.replaceInput(await makeInput({ patient: { objective: 'Objetivo editado' } }));
  assert.equal(session.snapshot().status, 'draft');
  assert.notEqual(session.snapshot().inputVersion, oldVersion);
  finishOld();
  await pending;
  assert.equal(session.snapshot().status, 'draft');
  assert.equal(session.snapshot().assessment, null);
});

test('approval requires current version and authorization, and simulation can never approve', async () => {
  const input = await makeInput();
  const makeProvider = () => ({
    metadata: { provider: 'fixture', model: 'deterministic' },
    generate: async (context) => makeAssessment(context),
  });

  const denied = createAdvisorSession({ provider: makeProvider(), authorizeReview: () => false });
  await denied.replaceInput(input);
  await denied.generate();
  await errorCode(() => denied.approve({ inputVersion: denied.snapshot().inputVersion, actor: { id: 'reviewer-1' } }), 'not_authorized');

  const allowed = createAdvisorSession({ provider: makeProvider(), authorizeReview: ({ id }) => id === 'reviewer-1' });
  await allowed.replaceInput(input);
  await allowed.generate();
  await errorCode(() => allowed.approve({ inputVersion: 'old', actor: { id: 'reviewer-1' } }), 'stale_input');
  const approved = await allowed.approve({ inputVersion: allowed.snapshot().inputVersion, actor: { id: 'reviewer-1' } });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approval.actorId, 'reviewer-1');
  assert.deepEqual(approved.history.at(-1).assessment, approved.assessment);
  assert.deepEqual(approved.history.at(-1).approval, approved.approval);

  const correctedSession = createAdvisorSession({ provider: makeProvider(), authorizeReview: () => true });
  await correctedSession.replaceInput(input);
  await correctedSession.generate();
  const original = correctedSession.snapshot().assessment;
  const corrected = structuredClone(original);
  corrected.summary = 'Resumen corregido por revisión profesional.';
  const correctedApproval = await correctedSession.approve({
    inputVersion: correctedSession.snapshot().inputVersion,
    actor: { id: 'reviewer-1' },
    correctedAssessment: corrected,
    reviewNotes: 'Se ajustó el resumen.',
  });
  assert.deepEqual(correctedApproval.assessment, original);
  assert.deepEqual(correctedApproval.approval.correctedAssessment, corrected);
  assert.equal(correctedApproval.approval.reviewNotes, 'Se ajustó el resumen.');

  const simulation = createAdvisorSession({ provider: makeProvider(), authorizeReview: () => true, simulation: true });
  await simulation.replaceInput(input);
  await simulation.generate();
  await errorCode(() => simulation.approve({ inputVersion: simulation.snapshot().inputVersion, actor: { id: 'reviewer-1' } }), 'simulation_not_approvable');
});

test('pending asynchronous authorization cannot approve a replacement input', async () => {
  let authorize;
  const provider = {
    metadata: { provider: 'fixture', model: 'deterministic' },
    generate: async (context) => makeAssessment(context),
  };
  const session = createAdvisorSession({
    provider,
    authorizeReview: () => new Promise((resolve) => { authorize = resolve; }),
  });
  await session.replaceInput(await makeInput());
  await session.generate();
  const oldVersion = session.snapshot().inputVersion;
  const approval = session.approve({ inputVersion: oldVersion, actor: { id: 'reviewer-1' } });
  await session.replaceInput(await makeInput({ patient: { objective: 'Nueva entrada' } }));
  authorize(true);
  await errorCode(() => approval, 'stale_input');
  assert.equal(session.snapshot().status, 'draft');
  assert.equal(session.snapshot().approval, null);
});

test('approval snapshots actor and corrected assessment before asynchronous authorization', async () => {
  let authorize;
  let authorizedActor;
  const session = createAdvisorSession({
    provider: {
      metadata: { provider: 'fixture', model: 'deterministic' },
      generate: async (context) => makeAssessment(context),
    },
    authorizeReview: (actor) => {
      authorizedActor = actor;
      return new Promise((resolve) => { authorize = resolve; });
    },
  });
  await session.replaceInput(await makeInput());
  await session.generate();
  const actor = { id: 'reviewer-original', permissions: ['skin-review'] };
  const corrected = structuredClone(session.snapshot().assessment);
  corrected.summary = 'Corrección válida capturada.';
  const approval = session.approve({
    inputVersion: session.snapshot().inputVersion,
    actor,
    correctedAssessment: corrected,
  });
  actor.id = 'reviewer-mutated';
  corrected.summary = '';
  authorize(true);
  const result = await approval;
  assert.equal(authorizedActor.id, 'reviewer-original');
  assert.equal(result.approval.actorId, 'reviewer-original');
  assert.equal(result.approval.correctedAssessment.summary, 'Corrección válida capturada.');
  assert.deepEqual(result.history.at(-1).provenance, result.provenance);
});

test('overlapping replacements keep only the latest prepared input', async () => {
  const session = createAdvisorSession({
    provider: { metadata: {}, generate: async (context) => makeAssessment(context) },
    authorizeReview: () => true,
  });
  const first = await makeInput({ patient: { objective: 'Primera' } });
  const second = await makeInput({ patient: { objective: 'Segunda' } });
  const firstReplacement = session.replaceInput(first);
  const secondReplacement = session.replaceInput(second);
  await Promise.all([firstReplacement, secondReplacement]);
  const generated = await session.generate();
  assert.equal(generated.status, 'pending_review');
  assert.notEqual(generated.inputVersion, (await prepareContext(first)).inputFingerprint);
  assert.equal(generated.inputVersion, (await prepareContext(second)).inputFingerprint);
});

test('session honors a pre-aborted signal, trusts provider simulation metadata, and sanitizes failures', async () => {
  let calls = 0;
  const provider = {
    metadata: { provider: 'fixture', model: 'deterministic', simulation: true },
    generate: async () => { calls += 1; throw Object.assign(new Error('private'), { code: 'PII_CUSTOM_CODE' }); },
  };
  const session = createAdvisorSession({ provider, authorizeReview: () => true });
  await session.replaceInput(await makeInput());
  const controller = new AbortController();
  controller.abort();
  await errorCode(() => session.generate({ signal: controller.signal }), 'aborted');
  assert.equal(calls, 0);

  await errorCode(() => session.generate({ retry: true }), 'generation_failed');
  assert.deepEqual(session.snapshot().failure, { code: 'generation_failed' });

  const simulated = createAdvisorSession({
    provider: { ...provider, generate: async (context) => makeAssessment(context) },
    authorizeReview: () => true,
  });
  await simulated.replaceInput(await makeInput());
  await simulated.generate();
  assert.equal(simulated.snapshot().provenance.simulation, true);
  await errorCode(() => simulated.approve({ inputVersion: simulated.snapshot().inputVersion, actor: { id: 'r' } }), 'simulation_not_approvable');
});

test('session clears an in-flight attempt when provider.generate throws synchronously', async () => {
  let calls = 0;
  const session = createAdvisorSession({
    provider: {
      metadata: { provider: 'fixture', model: 'deterministic' },
      generate(context) {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error('synchronous failure'), { code: 'network' });
        return Promise.resolve(makeAssessment(context));
      },
    },
    authorizeReview: () => true,
  });
  await session.replaceInput(await makeInput());
  await errorCode(() => session.generate(), 'network');
  assert.equal(session.snapshot().status, 'failed');
  const retry = await session.generate({ retry: true });
  assert.equal(calls, 2);
  assert.equal(retry.status, 'pending_review');
});

test('invalid replacement enters a safe failed state without retaining the active result', async () => {
  const session = createAdvisorSession({
    provider: {
      metadata: { provider: 'fixture', model: 'deterministic' },
      generate: async (context) => makeAssessment(context),
    },
    authorizeReview: () => true,
  });
  await session.replaceInput(await makeInput());
  await session.generate();
  await errorCode(() => makeInput({ patient: { age: Number.NaN } }).then(session.replaceInput), 'invalid_context');
  const snapshot = session.snapshot();
  assert.equal(snapshot.status, 'failed');
  assert.equal(snapshot.inputVersion, null);
  assert.equal(snapshot.assessment, null);
  assert.equal(snapshot.provenance, null);
  assert.equal(snapshot.approval, null);
  assert.deepEqual(snapshot.failure, { code: 'invalid_input' });
});

test('aborting a generation prevents a custom provider that ignores abort from publishing later', async () => {
  let finish;
  const session = createAdvisorSession({
    provider: {
      metadata: { provider: 'fixture', model: 'deterministic' },
      generate: (context) => new Promise((resolve) => { finish = () => resolve(makeAssessment(context)); }),
    },
    authorizeReview: () => true,
  });
  await session.replaceInput(await makeInput());
  const controller = new AbortController();
  const pending = session.generate({ signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof finish, 'function');
  controller.abort();
  await errorCode(() => pending, 'aborted');
  assert.equal(session.snapshot().status, 'failed');
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.snapshot().status, 'failed');
  assert.equal(session.snapshot().assessment, null);
});

test('a prepared context cannot be forged or mutated to bypass provider guards', async () => {
  const context = await prepareContext(await makeInput());
  const provider = createOpenAIProvider({ enabled: true, apiKey: 'key', fetch: async () => responseOf(makeAssessment(context)) });
  await errorCode(() => provider.generate(structuredClone(context)), 'untrusted_context');
  assert.throws(() => { context.consent.version = 'forged'; }, TypeError);
  assert.deepEqual(await provider.generate(context), makeAssessment(context));
});

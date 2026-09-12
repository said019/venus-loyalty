import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkinAdvisorWorkflow } from '../src/services/ai/skinAdvisor/workflow.js';
import { makeInput, makeAssessment } from './fixtures/skin-advisor.js';

async function fixture(overrides = {}) {
  const raw = await makeInput();
  let date = new Date('2026-09-11T12:00:00Z');
  const rows = [];
  const users = [{ id: 'owner', role: 'admin' }, { id: 'staff', role: 'staff' }, { id: 'other-admin', role: 'admin' }];
  const current = { id: 'record-fictional', updatedAt: date, age: 30, objectives: 'Rutina sencilla' };
  const photos = raw.photos.map(p => ({ id: p.id, recordId: current.id, url: '/fictional.png', takenAt: date }));
  const match = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('lte' in value) return row[key] && row[key] <= value.lte;
      if ('gt' in value) return row[key] && row[key] > value.gt;
    }
    return row[key] === value;
  });
  const db = {
    admin: { findUnique: async ({ where }) => users.find(u => u.id === where.id) || null },
    clientRecord: { findUnique: async ({ where }) => where.id === current.id ? structuredClone(current) : null },
    clientPhoto: { findMany: async ({ where }) => structuredClone(photos.filter(p => match(p, where))) },
    skinAdvisorAssessment: {
      findUnique: async ({ where }) => structuredClone(rows.find(p => p.id === where.id) || null),
      findMany: async ({ where }) => structuredClone(rows.filter(p => match(p, where))),
      count: async ({ where }) => rows.filter(p => match(p, where)).length,
      create: async ({ data }) => { const row = { id: `assessment-${rows.length}`, version: 1, status: 'draft', createdAt: date, ...structuredClone(data) }; rows.push(row); return structuredClone(row); },
      updateMany: async ({ where, data }) => { const selected = rows.filter(p => match(p, where)); for (const row of selected) for (const [key, value] of Object.entries(data)) row[key] = value?.increment ? row[key] + value.increment : structuredClone(value); return { count: selected.length }; },
    },
    $transaction: async fn => fn(db),
  };
  let calls = 0;
  const provider = { metadata: { provider: 'openai', model: 'fictional', simulation: false }, generate: async context => { calls++; return makeAssessment(context); }, ...overrides.provider };
  const workflow = createSkinAdvisorWorkflow({ prisma: db, provider, loadPhoto: overrides.loadPhoto || (async () => ({ bytes: raw.photos[0].bytes, mediaType: raw.photos[0].mediaType })), config: { enabled: true, configured: true, approverId: 'owner', consentVersion: 'v1', consentText: 'Fictitious consent', activeServices: raw.activeServices, protocols: raw.protocols, ...overrides.config }, clock: () => date });
  const body = { photos: photos.map(p => ({ id: p.id, zone: 'forehead', orientation: 'upright', lateralityResolved: true, capturedAt: '2026-09-10T11:00:00.000Z', capturedAtConfirmed: true })), patient: { age: 30, objective: 'Rutina sencilla' }, answers: { goal: 'Rutina sencilla' }, consentAccepted: true, consentVersion: 'v1', whiteLightOriginalConfirmed: true };
  return { workflow, db, rows, users, photos, current, body, calls: () => calls, advance: () => { date = new Date(date.getTime() + 121_000); } };
}

test('private draft, generate and exact owner approval retain immutable original output', async () => {
  const f = await fixture();
  const draft = await f.workflow.createDraft('staff', f.current.id, { ...f.body, answers: { goal: 'Rutina sencilla', secretChart: 'never persist' }, actorId: 'owner' });
  assert.equal(draft.createdById, 'staff');
  assert.equal(JSON.stringify(draft.input).includes('secretChart'), false);
  assert.equal(JSON.stringify(draft.input).includes('base64'), false);
  assert.equal(draft.input.whiteLightOriginalConfirmed, true);
  assert.equal(draft.input.photos[0].capturedAt, f.body.photos[0].capturedAt);
  assert.equal(draft.input.photos[0].sourceTakenAt, f.photos[0].takenAt.toISOString());
  const generated = await f.workflow.generate('staff', draft.id, { version: 1 });
  assert.equal(generated.status, 'pending_review');
  assert.equal(generated.version, 2);
  assert.equal(generated.attemptToken, undefined);
  await assert.rejects(f.workflow.approve('other-admin', draft.id, { version: 2 }), { code: 'not_authorized' });
  await assert.rejects(f.workflow.approve('staff', draft.id, { version: 2 }), { code: 'not_authorized' });
  const approved = await f.workflow.approve('owner', draft.id, { version: 2, reviewNotes: 'Revisión ficticia' });
  assert.equal(approved.status, 'approved');
  assert.deepEqual(approved.assessment, generated.assessment);
  assert.equal(approved.approval.actorId, 'owner');
  assert.equal(f.calls(), 1);
});

test('every public method checks the current database account', async () => {
  const f = await fixture();
  const draft = await f.workflow.createDraft('staff', f.current.id, f.body);
  f.users.splice(1, 1);
  for (const call of [() => f.workflow.getConfig('staff'), () => f.workflow.getRecord('staff', f.current.id), () => f.workflow.getAssessment('staff', draft.id), () => f.workflow.createDraft('staff', f.current.id, f.body), () => f.workflow.generate('staff', draft.id, { version: 1 }), () => f.workflow.approve('staff', draft.id, { version: 1 })]) await assert.rejects(call, { code: 'unauthenticated' });
});

test('draft creation rejects foreign photos and consent; disabled never calls provider', async () => {
  const f = await fixture({ config: { enabled: false } });
  await assert.rejects(f.workflow.createDraft('staff', f.current.id, { ...f.body, consentAccepted: false }), { code: 'consent_required' });
  await assert.rejects(f.workflow.createDraft('staff', f.current.id, { ...f.body, photos: [{ ...f.body.photos[0], id: 'foreign' }] }), { code: 'photo_ownership' });
  const draft = await f.workflow.createDraft('staff', f.current.id, f.body);
  await assert.rejects(f.workflow.generate('staff', draft.id, { version: 1 }), { code: 'disabled' });
  assert.equal(f.calls(), 0);
});

test('superseded and expired generations cannot publish or resend', async () => {
  let resolve;
  let started;
  const ready = new Promise(r => { started = r; });
  const f = await fixture({ provider: { generate: context => { started(); return new Promise(r => { resolve = () => r(makeAssessment(context)); }); } } });
  const draft = await f.workflow.createDraft('staff', f.current.id, f.body);
  const pending = f.workflow.generate('staff', draft.id, { version: 1 });
  await ready;
  await assert.rejects(f.workflow.generate('staff', draft.id, { version: 1 }), { code: 'stale_version' });
  f.advance();
  assert.equal((await f.workflow.getAssessment('staff', draft.id)).status, 'failed');
  resolve();
  await assert.rejects(pending, { code: 'stale_version' });
  await assert.rejects(f.workflow.generate('staff', draft.id, { version: 2 }), { code: 'stale_version' });
});

test('changed photo or account role prevents approval; simulated output cannot approve', async () => {
  const f = await fixture();
  const draft = await f.workflow.createDraft('staff', f.current.id, f.body);
  await f.workflow.generate('staff', draft.id, { version: 1 });
  f.photos[0].url = '/changed.png';
  await assert.rejects(f.workflow.approve('owner', draft.id, { version: 2 }), { code: 'stale_input' });
  const sim = await fixture({ provider: { metadata: { simulation: true } } });
  const sd = await sim.workflow.createDraft('staff', sim.current.id, sim.body);
  await sim.workflow.generate('staff', sd.id, { version: 1 });
  await assert.rejects(sim.workflow.approve('owner', sd.id, { version: 2 }), { code: 'simulation_not_approvable' });
});

test('a new draft supersedes pending output without erasing its audit history', async () => {
  const f = await fixture();
  const first = await f.workflow.createDraft('staff', f.current.id, f.body);
  const generated = await f.workflow.generate('staff', first.id, { version: 1 });
  await f.workflow.createDraft('staff', f.current.id, f.body);
  const old = await f.workflow.getAssessment('staff', first.id);
  assert.equal(old.status, 'superseded');
  assert.deepEqual(old.assessment, generated.assessment);
  await assert.rejects(f.workflow.approve('owner', first.id, { version: generated.version }), { code: 'stale_version' });
});

test('reception can prepare but never approve and marketing cannot access', async () => {
  const f = await fixture();
  f.users.push({ id: 'reception', role: 'recepcion' }, { id: 'marketing', role: 'marketing' });
  assert.equal((await f.workflow.getConfig('reception')).canApprove, false);
  const draft = await f.workflow.createDraft('reception', f.current.id, f.body);
  await assert.rejects(f.workflow.approve('reception', draft.id, { version: 1 }), { code: 'not_authorized' });
  await assert.rejects(f.workflow.getConfig('marketing'), { code: 'unauthenticated' });
});

test('white-light and original capture date attestations are mandatory', async () => {
  const f = await fixture();
  await assert.rejects(f.workflow.createDraft('staff', f.current.id, { ...f.body, whiteLightOriginalConfirmed: false }), { code: 'white_light_confirmation_required' });
  for (const change of [{ capturedAtConfirmed: false }, { capturedAt: undefined }, { capturedAt: 'tomorrow' }, { capturedAt: '2026-02-31T00:00:00Z' }, { capturedAt: '2027-01-01T00:00:00Z' }]) {
    await assert.rejects(f.workflow.createDraft('staff', f.current.id, { ...f.body, photos: [{ ...f.body.photos[0], ...change }] }), { code: 'capture_time_confirmation_required' });
  }
});

test('active provider keeps its record claim until pipeline deadline, late result cannot publish', async () => {
  let resolveProvider;
  let providerSignal;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = await fixture({ config: { pipelineTimeoutMs: 40 }, provider: { generate: (context, { signal }) => {
    providerSignal = signal;
    started();
    return new Promise(resolve => { resolveProvider = () => resolve(makeAssessment(context)); });
  } } });
  const draft = await f.workflow.createDraft('staff', f.current.id, f.body);
  const pending = f.workflow.generate('staff', draft.id, { version: 1 });
  const timedOut = assert.rejects(pending, { code: 'timeout', status: 504 });
  await ready;
  await assert.rejects(f.workflow.createDraft('owner', f.current.id, f.body), { code: 'already_generating', status: 409 });
  assert.equal(f.rows[0].status, 'generating');
  assert.equal(f.rows[0].leaseUntil.getTime() - f.current.updatedAt.getTime(), 120_000);
  await timedOut;
  assert.equal(providerSignal.aborted, true);
  assert.equal(f.rows[0].status, 'failed');
  resolveProvider();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.rows[0].assessment, undefined);
  assert.equal((await f.workflow.createDraft('staff', f.current.id, f.body)).status, 'draft');
});

test('pipeline deadline includes photo loading and prevents provider calls after late load', async () => {
  let release;
  const raw = await makeInput();
  const f = await fixture({ config: { pipelineTimeoutMs: 5 }, loadPhoto: () => new Promise(resolve => { release = () => resolve({ bytes: raw.photos[0].bytes, mediaType: raw.photos[0].mediaType }); }) });
  const draft = await f.workflow.createDraft('staff', f.current.id, f.body);
  await assert.rejects(f.workflow.generate('staff', draft.id, { version: 1 }), { code: 'timeout' });
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls(), 0);
  assert.equal(f.rows[0].failureCode, 'timeout');
});

// Isolated integration test; never loads the application's .env or database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import express from 'express';
import { createSkinAdvisorWorkflow } from '../src/services/ai/skinAdvisor/workflow.js';
import { createSkinAdvisorRouter } from '../src/routes/skinAdvisor.js';
import { makeInput, makeAssessment } from '../tests/fixtures/skin-advisor.js';

const url = new URL(process.env.SKIN_TEST_DATABASE_URL || '');
if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/skin_test' || url.username !== 'venus_test') throw new Error('Requires isolated local skin_test database on port 55439.');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
const suffix = randomUUID();
const owner = 'fixture-owner-' + suffix, other = 'fixture-other-' + suffix;
const recordId = 'fixture-record-' + suffix;
const raw = await makeInput();
const now = new Date();
const serve = process.argv.includes('--serve');
let server;
async function cleanup() { await prisma.clientRecord.deleteMany({ where: { id: recordId } }); await prisma.admin.deleteMany({ where: { id: { in: [owner, other] } } }); await prisma.$disconnect(); }
try {
  await prisma.admin.createMany({ data: [owner, other].map(id => ({ id, email: id + '@example.invalid', pass_hash: 'not-a-login-password', role: 'admin' })) });
  await prisma.clientRecord.create({ data: { id: recordId, cardId: 'fixture-card-' + suffix, age: 30, objectives: 'DATOS FICTICIOS · prueba sin OpenAI' } });
  const photo = await prisma.clientPhoto.create({ data: { recordId, url: 'http://127.0.0.1:8768/demo-photo.png', takenAt: now } });
  let calls = 0;
  const provider = { metadata: { provider: 'fixture', model: 'SIN-OPENAI', simulation: serve }, generate: async context => { calls++; return makeAssessment(context); } };
  const config = { enabled: true, configured: true, approverId: owner, consentVersion: 'fixture-v1', consentText: 'SIMULACIÓN: no se envían fotografías ni datos a OpenAI. Datos ficticios para probar la interfaz.', activeServices: raw.activeServices, protocols: raw.protocols };
  const create = () => createSkinAdvisorWorkflow({ prisma, provider, loadPhoto: async () => ({ bytes: raw.photos[0].bytes, mediaType: raw.photos[0].mediaType }), config });
  const workflow = create();
  const body = { whiteLightOriginalConfirmed: true, photos: [{ id: photo.id, zone: 'forehead', orientation: 'upright', lateralityResolved: true, capturedAt: now.toISOString(), capturedAtConfirmed: true }], patient: { age: 30, objective: 'Rutina sencilla' }, answers: { goal: 'Rutina sencilla' }, consentAccepted: true, consentVersion: 'fixture-v1' };
  const draft = await workflow.createDraft(owner, recordId, body);
  assert.equal((await create().getAssessment(owner, draft.id)).status, 'draft', 'survives new service instance');
  const generated = await workflow.generate(owner, draft.id, { version: draft.version });
  assert.equal(generated.status, 'pending_review');
  assert.equal(calls, 1);
  await assert.rejects(workflow.approve(other, draft.id, { version: generated.version }), { code: 'not_authorized' });
  if (!serve) {
    const approved = await create().approve(owner, draft.id, { version: generated.version, reviewNotes: 'Prueba ficticia de transacción' });
    assert.equal(approved.approval.actorId, owner);
    assert.equal((await create().getAssessment(owner, draft.id)).status, 'approved');
    const newer = await create().createDraft(owner, recordId, body);
    assert.equal((await create().getAssessment(owner, approved.id)).status, 'superseded');
    assert.equal((await create().getAssessment(owner, approved.id)).approval.actorId, owner);
    const double = await Promise.allSettled([create().generate(owner, newer.id, { version: newer.version }), create().generate(owner, newer.id, { version: newer.version })]);
    assert.equal(double.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(calls, 2, 'concurrent claims call provider once');
    console.log('PASS: real PostgreSQL persistence, owner approval, supersession audit and concurrent claim; synthetic data, no OpenAI.');
    await cleanup();
  } else {
    const app = express();
    app.get('/demo-photo.png', (req, res) => res.type('png').send(raw.photos[0].bytes));
    app.use('/api/skin-advisor', createSkinAdvisorRouter({ workflow, expectedOrigin: 'http://127.0.0.1:8768', authenticate: (req, res, next) => { req.admin = { uid: owner }; next(); } }));
    app.use(express.static(new URL('../public', import.meta.url).pathname));
    server = app.listen(8768, '127.0.0.1', () => console.log('SIMULACIÓN: http://127.0.0.1:8768/skin-advisor.html?recordId=' + recordId));
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => cleanup().finally(() => process.exit(0))));
  }
} catch (error) { if (server) server.close(); await cleanup().catch(() => {}); throw error; }

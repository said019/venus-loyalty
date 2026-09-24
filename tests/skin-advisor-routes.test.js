import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSkinAdvisorRouter } from '../src/routes/skinAdvisor.js';

test('router protects every endpoint and enforces exact origin, JSON, and trusted actor', async t => {
  const calls = [];
  const workflow = Object.fromEntries(['getConfig', 'getRecord', 'createDraft', 'getAssessment', 'generate', 'approve', 'previewPhoto', 'photoLayers'].map(name => [name, async (...args) => { calls.push({ name, args }); return { status: 'ok' }; }]));
  const app = express();
  app.use('/api/skin-advisor', createSkinAdvisorRouter({ workflow, expectedOrigin: 'https://venus.example', authenticate: (req, res, next) => { if (req.get('x-test-user')) req.admin = { uid: req.get('x-test-user') }; next(); } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/skin-advisor`;
  for (const path of ['/config', '/records/r', '/assessments/a']) assert.equal((await fetch(base + path)).status, 401);
  for (const path of ['/records/r/assessments', '/assessments/a/generate', '/assessments/a/approve', '/records/r/photos/p/preview']) assert.equal((await fetch(base + path, { method: 'POST' })).status, 401);
  const post = headers => fetch(base + '/assessments/a/approve', { method: 'POST', headers: { 'x-test-user': 'staff', ...headers }, body: JSON.stringify({ actorId: 'owner', version: 2 }) });
  for (const path of ['/config', '/records/r', '/assessments/a']) {
    for (const method of ['GET', 'HEAD']) {
      assert.equal((await fetch(base + path, { method, headers: { 'x-test-user': 'staff', origin: 'https://sibling.venus.example' } })).status, 403);
      assert.equal((await fetch(base + path, { method, headers: { 'x-test-user': 'staff', origin: 'https://venus.example' } })).status, 200);
      assert.equal((await fetch(base + path, { method, headers: { 'x-test-user': 'staff' } })).status, 200);
    }
  }
  assert.equal((await post({ 'content-type': 'application/json' })).status, 403);
  assert.equal((await post({ origin: 'https://evil.example', 'content-type': 'application/json' })).status, 403);
  assert.equal((await post({ origin: 'https://venus.example', 'content-type': 'text/plain' })).status, 415);
  const response = await post({ origin: 'https://venus.example', 'content-type': 'application/json' });
  assert.equal(response.status, 200);
  assert.equal(calls.at(-1).args[0], 'staff');
  assert.equal(calls.at(-1).name, 'approve');
  assert.deepEqual(await response.json(), { success: true, data: { status: 'ok' } });
  const preview = headers => fetch(base + '/records/r/photos/p/preview', { method: 'POST', headers: { 'x-test-user': 'staff', ...headers }, body: JSON.stringify({ mode: 'red_contrast', actorId: 'owner' }) });
  assert.equal((await preview({ 'content-type': 'application/json' })).status, 403);
  assert.equal((await preview({ origin: 'https://evil.example', 'content-type': 'application/json' })).status, 403);
  assert.equal((await preview({ origin: 'https://venus.example', 'content-type': 'text/plain' })).status, 415);
  const rendered = await preview({ origin: 'https://venus.example', 'content-type': 'application/json' });
  assert.equal(rendered.status, 200);
  assert.equal(rendered.headers.get('cache-control'), 'private, no-store');
  assert.equal(calls.at(-1).name, 'previewPhoto');
  assert.deepEqual(calls.at(-1).args.slice(0, 3), ['staff', 'r', 'p']);
  const layerRequest = headers => fetch(base + '/records/r/photos/p/layers', { method: 'POST', headers, body: '{}' });
  assert.equal((await layerRequest({})).status, 401);
  assert.equal((await layerRequest({ 'x-test-user': 'staff', origin: 'https://evil.example', 'content-type': 'application/json' })).status, 403);
  const layers = await layerRequest({ 'x-test-user': 'staff', origin: 'https://venus.example', 'content-type': 'application/json' });
  assert.equal(layers.status, 200);
  assert.equal(layers.headers.get('cache-control'), 'private, no-store');
  assert.equal(calls.at(-1).name, 'photoLayers');
  assert.deepEqual(calls.at(-1).args, ['staff', 'r', 'p']);
});

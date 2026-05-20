import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { integrationAuth } from '../lib/auth.js';

// Levanta una mini app Express con el middleware bajo prueba y un endpoint
// dummy /test que solo se alcanza si el middleware llama next().
async function startApp(mw) {
  const app = express();
  app.use(mw);
  app.get('/test', (_req, res) => res.json({ hit: true }));
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}/test`,
        close: () => new Promise(r => server.close(r)),
      });
    });
  });
}

test('integrationAuth: sin INTEGRATION_API_KEY → 503 INTEGRATION_DISABLED', async () => {
  delete process.env.INTEGRATION_API_KEY;
  const { url, close } = await startApp(integrationAuth);
  try {
    const res = await fetch(url);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'INTEGRATION_DISABLED');
  } finally { await close(); }
});

test('integrationAuth: con env, sin header → 401 UNAUTHORIZED', async () => {
  process.env.INTEGRATION_API_KEY = 'test-key-123';
  const { url, close } = await startApp(integrationAuth);
  try {
    const res = await fetch(url);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, 'UNAUTHORIZED');
  } finally { await close(); }
});

test('integrationAuth: con Bearer pero key incorrecta → 401', async () => {
  process.env.INTEGRATION_API_KEY = 'test-key-123';
  const { url, close } = await startApp(integrationAuth);
  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer wrong' } });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, 'UNAUTHORIZED');
  } finally { await close(); }
});

test('integrationAuth: con Bearer y key correcta → 200 + next() ejecuta handler', async () => {
  process.env.INTEGRATION_API_KEY = 'test-key-123';
  const { url, close } = await startApp(integrationAuth);
  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer test-key-123' } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).hit, true);
  } finally { await close(); }
});

test('integrationLogger: emite 1 línea JSON con kind=integration tras finish', async () => {
  const lines = [];
  const orig = console.log;
  console.log = (msg) => lines.push(msg);
  let server;
  try {
    const { integrationLogger } = await import('../lib/auth.js');
    const app = express();
    app.use(integrationLogger);
    app.get('/test', (_req, res) => res.json({}));
    await new Promise(r => { server = app.listen(0, r); });
    const port = server.address().port;
    await fetch(`http://127.0.0.1:${port}/test`);
    // Espera al evento 'finish' del response
    await new Promise(r => setTimeout(r, 50));
    const parsed = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    const log = parsed.find(p => p.kind === 'integration');
    assert.ok(log, 'falta línea JSON con kind=integration');
    assert.equal(log.method, 'GET');
    assert.equal(log.path, '/test');
    assert.equal(log.status, 200);
    assert.equal(typeof log.ms, 'number');
    assert.ok(log.ts.endsWith('Z'), 'ts debe ser ISO UTC');
  } finally {
    console.log = orig;
    if (server) await new Promise(r => server.close(r));
  }
});

test('GET /api/integrations/ping con auth → 200 {ok, ts, version}', async () => {
  process.env.INTEGRATION_API_KEY = 'pong-key';
  const { integrationAuth, integrationLogger } = await import('../lib/auth.js');
  const { default: router } = await import('../src/routes/integrations.js');
  const app = express();
  app.use('/api/integrations', integrationLogger, integrationAuth, router);
  let server;
  try {
    await new Promise(r => { server = app.listen(0, r); });
    const port = server.address().port;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/integrations/ping`,
      { headers: { Authorization: 'Bearer pong-key' } }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.version, '1');
    assert.ok(!isNaN(new Date(body.ts).getTime()), 'ts debe ser parseable');
  } finally {
    if (server) await new Promise(r => server.close(r));
  }
});

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

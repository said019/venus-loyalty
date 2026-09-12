import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkinPhotoLoader } from '../src/services/ai/skinAdvisor/photoLoader.js';

test('photo loader rejects foreign storage and redirects without following them', async () => {
  let calls = 0;
  const load = createSkinPhotoLoader({ cloudName: 'venus', fetch: async () => { calls++; return new Response('', { status: 302 }); } });
  for (const url of ['http://res.cloudinary.com/venus/image/upload/x', 'https://example.com/x', 'https://res.cloudinary.com/other/image/upload/x', 'https://res.cloudinary.com/venus/image/fetch/x', 'https://user@res.cloudinary.com/venus/image/upload/x']) {
    await assert.rejects(load({ url }), { code: 'photo_storage_unavailable' });
  }
  assert.equal(calls, 0);
  await assert.rejects(load({ url: 'https://res.cloudinary.com/venus/image/upload/x' }), { code: 'photo_unavailable' });
  assert.equal(calls, 1);
});

test('photo loader accepts bounded supported bytes with no referrer or redirect', async () => {
  const load = createSkinPhotoLoader({ cloudName: 'venus', fetch: async (url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
  } });
  const result = await load({ url: 'https://res.cloudinary.com/venus/image/upload/v1/photo.png' });
  assert.equal(result.mediaType, 'image/png');
  assert.deepEqual([...result.bytes], [1, 2, 3]);
});

test('photo loader bounds response size and time and rejects unsupported MIME', async () => {
  const photo = { url: 'https://res.cloudinary.com/venus/image/upload/x' };
  for (const response of [new Response('bad', { headers: { 'content-type': 'text/html' } }), new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } })]) {
    await assert.rejects(createSkinPhotoLoader({ cloudName: 'venus', fetch: async () => response })(photo));
  }
  await assert.rejects(createSkinPhotoLoader({ cloudName: 'venus', timeoutMs: 5, fetch: () => new Promise(() => {}) })(photo), { code: 'photo_timeout' });
});

test('pipeline cancellation stops a pending photo request', async () => {
  const controller = new AbortController();
  let requestSignal;
  const load = createSkinPhotoLoader({ cloudName: 'venus', fetch: (url, options) => { requestSignal = options.signal; return new Promise(() => {}); } });
  const pending = load({ url: 'https://res.cloudinary.com/venus/image/upload/x' }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'photo_timeout' });
  assert.equal(requestSignal.aborted, true);
});

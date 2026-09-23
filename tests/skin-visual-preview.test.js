import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createVisualPreview, VISUAL_MODES } from '../src/services/skinVisualPreview.js';

test('display transforms are bounded, deterministic and never mutate the source', async () => {
  const pixels = Buffer.alloc(60 * 80 * 3);
  for (let i = 0; i < pixels.length; i += 3) { pixels[i] = i % 220; pixels[i + 1] = (i * 3) % 180; pixels[i + 2] = (i * 7) % 150; }
  const original = await sharp(pixels, { raw: { width: 60, height: 80, channels: 3 } }).png().toBuffer();
  const before = Buffer.from(original);
  const results = [];
  for (const mode of VISUAL_MODES) {
    const result = await createVisualPreview(original, mode);
    const bytes = Buffer.from(result.dataUrl.split(',')[1], 'base64');
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'jpeg');
    assert.equal(metadata.width, 60); assert.equal(metadata.height, 80);
    assert.equal(result.mode, mode); assert.match(result.notice, /no medición/);
    assert.equal((await createVisualPreview(original, mode)).dataUrl, result.dataUrl);
    results.push(result.dataUrl);
  }
  assert.equal(new Set(results).size, VISUAL_MODES.length);
  assert.deepEqual(original, before);
});

test('unsupported modes, corrupt images and oversized input fail closed', async () => {
  await assert.rejects(createVisualPreview(Buffer.from('x'), 'uv'));
  await assert.rejects(createVisualPreview(Buffer.from('not an image'), 'red_contrast'));
  await assert.rejects(createVisualPreview(Buffer.alloc(5 * 1024 * 1024 + 1), 'detail'));
});

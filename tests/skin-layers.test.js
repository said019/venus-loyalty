import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { createSkinLayersEngine } from '../src/services/skinLayers.js';

const photo = () => sharp({ create: { width: 32, height: 32, channels: 3, background: '#a08070' } }).png().toBuffer();

test('local layers disabled without runtime and reject invalid input', async () => {
  await assert.rejects(createSkinLayersEngine({ python: '' }).generate(Buffer.from('x')), { code: 'layers_disabled' });
  await assert.rejects(createSkinLayersEngine({ python: 'unused' }).generate(Buffer.alloc(0)), { code: 'invalid_photo' });
});

test('local layers return whitelisted images and clean private files', async () => {
  let directory;
  const bytes = await photo();
  const engine = createSkinLayersEngine({ python: 'fake', run: async (_, args) => {
    const output = args[args.indexOf('--out') + 1]; directory = dirname(output);
    await mkdir(output);
    await writeFile(join(output, 'poros.jpg'), bytes);
    await writeFile(join(output, 'manifest.json'), JSON.stringify({ schemaVersion: 1, validated: false, score: null, method: 'test', images: ['poros.jpg', '../../secret.jpg'], layers: { poros: { candidateCount: 12 } } }));
  } });
  const result = await engine.generate(bytes);
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].candidateCount, 12);
  assert.match(result.images[0].dataUrl, /^data:image\/jpeg;base64,/);
  await assert.rejects(access(directory));
});

test('local layers serialize expensive jobs and clean failures', async () => {
  let release, directory;
  const entered = new Promise(resolve => { release = resolve; });
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const engine = createSkinLayersEngine({ python: 'fake', run: async (_, args) => {
    directory = dirname(args[args.indexOf('--out') + 1]); release(); await gate; throw new Error('failure');
  } });
  const bytes = await photo();
  const pending = engine.generate(bytes);
  const rejected = assert.rejects(pending, /failure/);
  await entered;
  await assert.rejects(engine.generate(bytes), { code: 'layers_busy' });
  finish(); await rejected;
  await assert.rejects(access(directory));
  await assert.rejects(engine.generate(bytes), /failure/);
});

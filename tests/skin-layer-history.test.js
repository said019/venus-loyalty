import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkinAdvisorWorkflow } from '../src/services/ai/skinAdvisor/workflow.js';

function fixture({ store: storeOverrides = {}, createFails = false } = {}) {
  const date = new Date('2026-10-21T12:00:00Z');
  const users = [{ id: 'staff', role: 'staff' }, { id: 'marketing', role: 'marketing' }];
  const records = ['record-a', 'record-b'];
  const photos = [
    { id: 'white', recordId: 'record-a', url: 'https://res.cloudinary.com/demo/image/upload/white.jpg', description: 'Skin | modo=image' },
    { id: 'uv', recordId: 'record-a', url: 'https://res.cloudinary.com/demo/image/upload/uv.jpg', description: 'Skin | modo=image_uv' },
    { id: 'foreign', recordId: 'record-b', url: 'https://res.cloudinary.com/demo/image/upload/foreign.jpg', description: 'Skin | modo=image' },
  ];
  const sets = [], saved = [], removed = [];
  const match = (row, where) => Object.entries(where).every(([key, value]) => value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value);
  const db = {
    admin: { findUnique: async ({ where }) => users.find(u => u.id === where.id) || null },
    clientRecord: { findUnique: async ({ where }) => records.includes(where.id) ? { id: where.id, updatedAt: date } : null },
    clientPhoto: { findMany: async ({ where }) => structuredClone(photos.filter(p => match(p, where))) },
    skinLayerSet: {
      create: async ({ data }) => {
        if (createFails) throw new Error('database down');
        const row = { id: `set-${sets.length}`, createdAt: new Date(date.getTime() + sets.length * 1000), ...structuredClone(data) };
        sets.push(row); return structuredClone(row);
      },
      findFirst: async ({ where, orderBy }) => {
        assert.deepEqual(orderBy, { createdAt: 'desc' });
        return structuredClone(sets.filter(s => match(s, where)).at(-1) || null);
      },
    },
  };
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const layersEngine = { enabled: true, generate: async () => ({ method: 'venus-classical-cv-v1', validated: false, notice: 'Experimental.', images: [
    { key: 'poros', bytes: jpeg, candidateCount: 12 }, { key: 'arrugas', bytes: jpeg, candidateCount: 3 },
  ] }) };
  const layerStore = {
    save: async (bytes, { recordId, key }) => { assert.ok(Buffer.isBuffer(bytes)); const n = saved.length; saved.push({ recordId, key }); return { url: `https://res.cloudinary.com/demo/image/upload/maps/${recordId}/${key}-${n}.jpg`, publicId: `maps/${recordId}/${key}-${n}` }; },
    remove: async publicId => { removed.push(publicId); },
    ...storeOverrides,
  };
  const workflow = createSkinAdvisorWorkflow({ prisma: db, provider: { metadata: {} }, loadPhoto: async () => ({ bytes: jpeg, mediaType: 'image/jpeg' }), layersEngine, layerStore, clock: () => date });
  return { workflow, sets, saved, removed };
}

test('generated maps are stored and returned as saved Cloudinary images, never as inline data', async () => {
  const f = fixture();
  const result = await f.workflow.photoLayers('staff', 'record-a', 'white');
  assert.equal(result.id, 'set-0');
  assert.equal(result.sourcePhotoId, 'white');
  assert.equal(result.sourceUrl, 'https://res.cloudinary.com/demo/image/upload/white.jpg');
  assert.equal(result.createdAt, '2026-10-21T12:00:00.000Z');
  assert.equal(result.validated, false);
  assert.deepEqual(result.images.map(i => [i.key, i.candidateCount]), [['poros', 12], ['arrugas', 3]]);
  for (const image of result.images) {
    assert.match(image.url, /^https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/maps\/record-a\//);
    assert.equal(image.bytes, undefined);
    assert.equal(image.publicId, undefined);
  }
  assert.equal(f.sets.length, 1);
  assert.equal(f.sets[0].recordId, 'record-a');
  assert.equal(f.sets[0].sourcePhotoId, 'white');
  assert.equal(f.sets[0].createdById, 'staff');
  assert.deepEqual(f.sets[0].images.map(i => i.publicId), ['maps/record-a/poros-0', 'maps/record-a/arrugas-1']);
});

test('saved maps reload the latest set for that photo without reprocessing', async () => {
  const f = fixture();
  assert.equal(await f.workflow.savedLayers('staff', 'record-a', 'white'), null);
  await f.workflow.photoLayers('staff', 'record-a', 'white');
  await f.workflow.photoLayers('staff', 'record-a', 'white');
  const saved = await f.workflow.savedLayers('staff', 'record-a', 'white');
  assert.equal(saved.id, 'set-1');
  assert.equal(saved.notice.length > 0, true);
  assert.equal(saved.images[0].publicId, undefined);
  assert.equal(f.saved.length, 4);
});

test('saved maps enforce account, record and photo ownership', async () => {
  const f = fixture();
  await assert.rejects(f.workflow.savedLayers('nobody', 'record-a', 'white'), { code: 'unauthenticated' });
  await assert.rejects(f.workflow.savedLayers('marketing', 'record-a', 'white'), { code: 'unauthenticated' });
  await assert.rejects(f.workflow.savedLayers('staff', 'record-a', 'foreign'), { code: 'photo_ownership' });
  await assert.rejects(f.workflow.photoLayers('staff', 'record-a', 'foreign'), { code: 'photo_ownership' });
  await assert.rejects(f.workflow.photoLayers('staff', 'record-a', 'uv'), { code: 'invalid_photo' });
  assert.equal(f.saved.length, 0);
});

test('a failed upload or database write removes every uploaded map', async () => {
  let calls = 0;
  const partial = fixture({ store: { save: async (bytes, { recordId, key }) => { if (++calls === 2) throw new Error('cloudinary down'); return { url: `https://res.cloudinary.com/demo/image/upload/${key}.jpg`, publicId: `p-${key}` }; } } });
  await assert.rejects(partial.workflow.photoLayers('staff', 'record-a', 'white'), { code: 'layers_storage_unavailable' });
  assert.deepEqual(partial.removed, ['p-poros']);
  assert.equal(partial.sets.length, 0);

  const dbDown = fixture({ createFails: true });
  await assert.rejects(dbDown.workflow.photoLayers('staff', 'record-a', 'white'), { code: 'layers_storage_unavailable' });
  assert.deepEqual(dbDown.removed, ['maps/record-a/poros-0', 'maps/record-a/arrugas-1']);
});

test('stored URLs outside the configured image host are rejected', async () => {
  const f = fixture({ store: { save: async () => ({ url: 'https://evil.example/x.jpg', publicId: 'x' }) } });
  await assert.rejects(f.workflow.photoLayers('staff', 'record-a', 'white'), { code: 'layers_storage_unavailable' });
  assert.equal(f.sets.length, 0);
});

test('maps stay disabled when no storage is configured', async () => {
  const f = fixture();
  const workflow = createSkinAdvisorWorkflow({ prisma: { admin: { findUnique: async () => ({ id: 'staff', role: 'staff' }) }, clientRecord: { findUnique: async () => ({ id: 'record-a' }) } }, provider: { metadata: {} }, loadPhoto: async () => ({}), layersEngine: { enabled: true }, clock: () => new Date() });
  await assert.rejects(workflow.photoLayers('staff', 'record-a', 'white'), { code: 'layers_disabled' });
  assert.ok(f);
});

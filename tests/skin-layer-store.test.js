import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkinLayerStore } from '../src/services/skinLayerStore.js';

function fakeCloudinary() {
  const uploads = [], destroyed = [];
  return { uploads, destroyed, uploader: {
    upload_stream(options, callback) {
      const chunks = [];
      return { write: chunk => chunks.push(chunk), end(chunk) {
        if (chunk) chunks.push(chunk);
        uploads.push({ options, bytes: Buffer.concat(chunks) });
        callback(null, { secure_url: `https://res.cloudinary.com/demo/image/upload/${options.folder}/${options.public_id}.jpg`, public_id: `${options.folder}/${options.public_id}` });
      } };
    },
    destroy: async publicId => { destroyed.push(publicId); return { result: 'ok' }; },
  } };
}

test('maps upload as JPEGs inside the skin-maps folder and return HTTPS URL plus public id', async () => {
  const cloudinary = fakeCloudinary();
  const store = createSkinLayerStore({ cloudinary });
  const stored = await store.save(Buffer.from([1, 2, 3]), { recordId: 'rec_1', key: 'arrugas' });
  assert.match(stored.url, /^https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/venus-expedientes\/skin-maps\/rec_1\/arrugas-/);
  assert.match(stored.publicId, /^venus-expedientes\/skin-maps\/rec_1\/arrugas-[0-9a-f-]{36}$/);
  assert.deepEqual(cloudinary.uploads[0].bytes, Buffer.from([1, 2, 3]));
  assert.equal(cloudinary.uploads[0].options.overwrite, false);
  assert.equal(cloudinary.uploads[0].options.resource_type, 'image');
  await store.remove(stored.publicId);
  assert.deepEqual(cloudinary.destroyed, [stored.publicId]);
});

test('unsafe folder or layer names are refused before uploading', async () => {
  const cloudinary = fakeCloudinary();
  const store = createSkinLayerStore({ cloudinary });
  for (const [recordId, key] of [['../x', 'poros'], ['rec', 'poros/../../x'], ['', 'poros'], ['rec', 'Poros ']]) {
    await assert.rejects(store.save(Buffer.from([1]), { recordId, key }), /invalid_layer_target/);
  }
  await assert.rejects(store.remove('other-folder/x'), /invalid_layer_target/);
  assert.equal(cloudinary.uploads.length, 0);
  assert.equal(cloudinary.destroyed.length, 0);
});

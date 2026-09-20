import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/moji-import.js';
const inspect = globalThis.VenusMojiImport.inspect;
const files = () => ['image', 'image_uv', 'image_woods', 'image_positive', 'image_negative', 'image_blue'].map(mode => ({ name: `143656-${mode}.jpg`, size: 100 }));
test('imports all six named vendor modes without classifying UV as white', () => {
  const result = inspect(files()); assert.equal(result.length, 6); assert.equal(result[0].mode, 'image'); assert.equal(result.filter(x => x.mode === 'image').length, 1);
});
test('rejects partial, mixed-session, duplicate, unknown and oversized sets', () => {
  assert.throws(() => inspect(files().slice(1)));
  for (const replacement of [{name:'999999-image.jpg',size:100}, {name:'143656-image_uv.jpg',size:100}, {name:'143656-image_red.jpg',size:100}, {name:'143656-image.jpg',size:11*1024*1024}]) {
    const input=files();input[0]=replacement;assert.throws(() => inspect(input));
  }
});

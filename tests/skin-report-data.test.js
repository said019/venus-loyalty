import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox = {};
vm.runInNewContext(fs.readFileSync(new URL('../public/skin-report-data.js', import.meta.url), 'utf8'), sandbox);
const { captures, modeOf } = sandbox.VenusReportData;
test('replaced catalog photo cannot relabel or enable filters on the saved original', () => {
  const result = captures({ input: { photos: [{ id: 'same', sourceUrl: '/saved.jpg' }] } }, [
    { id: 'same', url: '/replacement.jpg', description: 'modo=image' }
  ]);
  assert.equal(result[0].url, '/saved.jpg');
  assert.equal(result[0].mode, 'unknown');
});
test('native modality is read from exact identifiers, never from color or filename', () => {
  assert.equal(modeOf({ description: 'Protocolo | modo=image_uv | disparo=2' }), 'image_uv');
  assert.equal(modeOf({ description: 'Foto azul', url: '/blue.jpg' }), 'unknown');
  assert.equal(modeOf({ description: 'modo=image_uvfake' }), 'unknown');
});
test('gallery preserves immutable analysis originals and marks nearby captures as unanalysed', () => {
  const time = '2026-09-23T10:00:00Z';
  const row = { input: { photos: [{ id: 'white', sourceUrl: '/original.jpg', capturedAt: time }] } };
  const catalog = [
    { id: 'white', url: '/original.jpg', takenAt: time, description: 'modo=image' },
    { id: 'uv', url: '/uv.jpg', takenAt: time, description: 'modo=image_uv' },
    { id: 'old', url: '/other.jpg', takenAt: '2026-09-23T08:00:00Z', description: 'modo=image' },
    { id: 'unknown', url: '/unknown.jpg', takenAt: time },
  ];
  const result = captures(row, catalog);
  assert.equal(result.length, 2); assert.equal(result[0].url, '/original.jpg');
  assert.equal(result[0].analyzed, true); assert.equal(result[1].analyzed, false);
  assert.equal(result[1].nearby, true); assert.equal(result[1].orientation, 'unknown');
  assert.equal(result[1].lateralityResolved, false);
});

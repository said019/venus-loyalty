import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const box = { URLSearchParams }; vm.createContext(box);
vm.runInContext(fs.readFileSync('public/moji-capture-flow.js', 'utf8'), box);
const flow = box.VenusCaptureFlow;
test('capture sessions reject late photos from a different client and reset selections', () => {
  const s = flow.session(); s.reset('record-one'); const old = s.ticket();
  assert.equal(s.add(old, { id: 'photo1' }), true);
  assert.match(s.advisorUrl('card1'), /photoIds=photo1/);
  s.reset('record-two'); assert.equal(s.add(old, { id: 'late-photo' }), false);
  assert.equal(s.photos().length, 0); assert.throws(() => s.advisorUrl('card2'));
});
test('capture selection is bounded and never accepts duplicate photos', () => {
  const s = flow.session(); s.reset('r'); const t = s.ticket();
  for (let i = 0; i < 4; i++) assert.equal(s.add(t, { id: 'p' + i }), true);
  assert.equal(s.add(t, { id: 'p0' }), false); assert.equal(s.add(t, { id: 'p4' }), false);
  assert.equal(s.photos().length, 4);
});
test('advisor query accepts bounded IDs only, without granting ownership or attestations', () => {
  assert.deepEqual(Array.from(flow.selectedIds('?capture=1&photoIds=p1,p1,p2,https://evil')), ['p1', 'p2']);
  assert.equal(flow.selectedIds('?photoIds=p1').length, 0);
});
test('deleting a captured photo frees its slot and excludes it from analysis', () => {
  const s = flow.session(); s.reset('r'); const ticket = s.ticket();
  for (let i = 0; i < 4; i++) s.add(ticket, { id: 'p' + i });
  assert.equal(s.remove(ticket, 'p1'), true);
  assert.equal(s.add(ticket, { id: 'replacement' }), true);
  assert.doesNotMatch(s.advisorUrl('card'), /p1/);
  s.reset('another'); s.add(s.ticket(), { id: 'replacement' });
  assert.equal(s.remove(ticket, 'replacement'), false);
  assert.equal(s.photos().length, 1);
});
test('request deadline includes a stalled JSON response body', async () => {
  const source = fs.readFileSync('public/moji-capture.js', 'utf8');
  const functions = source.slice(source.indexOf('  function bounded('), source.indexOf('  function controls('));
  const context = { fetch: async () => ({ status: 200, ok: true, json: () => new Promise(() => {}) }), setTimeout: fn => setTimeout(fn, 5), clearTimeout, Promise, Error };
  vm.createContext(context); vm.runInContext(functions + '\nthis.request = json;', context);
  await assert.rejects(context.request('/test'), /tardó demasiado/);
});
test('capture and advisor prohibit frames; capture loads ES2018 external scripts', () => {
  for (const p of ['public/captura.html', 'public/skin-advisor.html']) {
    const html = fs.readFileSync(p, 'utf8');
    assert.match(html, /frame-src 'none'/); assert.doesNotMatch(html, /<iframe/i);
  }
  const js = fs.readFileSync('public/moji-capture.js', 'utf8');
  assert.doesNotMatch(js, /\?\.|\?\?/);
  assert.match(js, /result\.request !== pendingLight\.request/);
});

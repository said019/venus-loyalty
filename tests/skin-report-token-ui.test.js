import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/mi-piel.js', import.meta.url), 'utf8');
function boot(fragment, stored, blockedStorage = false) {
  const requests = [], saved = [], history = [];
  const el = () => ({ appendChild() {}, setAttribute() {} });
  const context = {
    window: {}, URLSearchParams,
    document: { readyState: 'complete', getElementById: () => el(), createElement: el },
    location: { hash: fragment, pathname: '/mi-piel.html', search: '?card=card_123&v=v1' },
    sessionStorage: {
      setItem: (...args) => { if (blockedStorage) throw new Error('blocked'); saved.push(args); },
      getItem: () => stored,
    },
    history: { replaceState: (...args) => history.push(args) },
    fetch: (...args) => { requests.push(args); return new Promise(() => {}); },
  };
  vm.runInNewContext(source, context);
  return { requests, saved, history };
}
test('missing token never requests a private report', () => {
  assert.equal(boot('', null).requests.length, 0);
});
test('fragment credential becomes a bearer, is retained per card and removed from URL', () => {
  const token = 'a'.repeat(64), run = boot('#skinToken=' + token, null);
  assert.equal(run.requests[0][0], '/api/public/card/card_123/skin-reports/v1');
  assert.equal(run.requests[0][1].headers.Authorization, 'Bearer ' + token);
  assert.deepEqual(run.saved, [['skin-access:card_123', token]]);
  assert.equal(run.history[0][2], '/mi-piel.html?card=card_123&v=v1');
});
test('reload reuses the token; blocked storage can still open the shared link', () => {
  const token = 'b'.repeat(64);
  assert.equal(boot('', token).requests[0][1].headers.Authorization, 'Bearer ' + token);
  assert.equal(boot('#skinToken=' + token, null, true).requests[0][1].headers.Authorization, 'Bearer ' + token);
});

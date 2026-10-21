import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('mi-piel page is Chrome 61 safe, self-hosted and private', () => {
  const js = read('public/mi-piel.js'), css = read('public/mi-piel.css'), html = read('public/mi-piel.html');
  assert.doesNotThrow(() => new vm.Script(js));
  assert.doesNotMatch(js, /\?\.|\?\?|innerHTML|eval\(|fonts\.googleapis|candidateCount|publicId/);
  assert.doesNotMatch(css, /(^|[^-])gap\s*:|clamp\(|aspect-ratio|fonts\.googleapis|font-variation/m);
  assert.match(css, /grid-gap/);
  assert.match(css, /url\(\/fonts\/prata-latin-400-normal\.woff2\)/);
  assert.match(html, /<html lang="es">/);
  assert.match(html, /Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:\/\/res\.cloudinary\.com; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /<script>|onclick=/);
  assert.match(js, /!u\.port/);
  assert.match(js, /window\.VenusMiPiel = /);
  assert.match(js, /skin-reports/);
  assert.match(js, /Original no disponible/);
  assert.match(js, /Este reporte no está disponible/);
  for (const f of ['prata-latin-400-normal', 'manrope-latin-400-normal', 'manrope-latin-700-normal']) assert.ok(existsSync(new URL('../public/fonts/' + f + '.woff2', import.meta.url)));
});

test('mi-piel.css is scoped so it cannot leak into the staff page', () => {
  const css = read('public/mi-piel.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const ok = /^(\.mp|body\.mp-page)/;
  const checkList = list => list.split(',').map(x => x.trim()).filter(Boolean).forEach(sel => assert.match(sel, ok, 'unscoped selector: ' + sel));
  let rest = css, checked = 0;
  while (rest.trim()) {
    const open = rest.indexOf('{');
    if (open < 0) break;
    const head = rest.slice(0, open).trim();
    if (/^@font-face/.test(head)) { rest = rest.slice(rest.indexOf('}') + 1); continue; }
    if (/^@keyframes/.test(head)) { let d = 1, i = open + 1; while (d && i < rest.length) { if (rest[i] === '{') d++; else if (rest[i] === '}') d--; i++; } rest = rest.slice(i); continue; }
    if (/^@media/.test(head)) {
      let d = 1, i = open + 1; while (d && i < rest.length) { if (rest[i] === '{') d++; else if (rest[i] === '}') d--; i++; }
      const inner = rest.slice(open + 1, i - 1);
      inner.split('}').forEach(r => { const b = r.indexOf('{'); if (b >= 0) { checkList(r.slice(0, b)); checked++; } });
      rest = rest.slice(i); continue;
    }
    checkList(head); checked++;
    rest = rest.slice(rest.indexOf('}') + 1);
  }
  assert.ok(checked > 40);
  assert.match(read('public/mi-piel.html'), /<body class="mp-page">/);
  assert.match(read('public/mi-piel.js'), /'mp mp-' \+ mode/);
});

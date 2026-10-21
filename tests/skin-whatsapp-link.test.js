import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/services/whatsapp-v2.js', import.meta.url), 'utf8');

test('WhatsApp service sends the Mi Piel report link', () => {
  assert.match(src, /async sendMiPielLink\(card, url\)/);
  assert.match(src, /tu reporte de piel de \*Venus Cosmetología\* ya está listo/);
  assert.match(src, /\$\{url\}/);
});

// Verificación lossless: cada archivo CSS extraído debe ser EXACTAMENTE igual
// a las líneas que estaban entre <style> y </style> en el admin.html original
// (git HEAD). Además, el admin.html nuevo debe diferir del original SOLO en
// que cada bloque <style>..</style> fue sustituido por un <link>.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const origLines = execSync('git show HEAD:public/admin.html').toString('utf8').split('\n');

// (1-based) open = línea <style>, close = línea </style>
const BLOCKS = [
  { open: 19,    close: 5459,  file: 'admin-base.css' },
  { open: 8158,  close: 10517, file: 'admin-extra.css' },
  { open: 10519, close: 11415, file: 'admin-redesign.css' },
];

let allOk = true;
for (const b of BLOCKS) {
  const originalInner = origLines.slice(b.open, b.close - 1).join('\n'); // entre tags, exclusivo
  const extracted = fs.readFileSync('public/css/admin/' + b.file, 'utf8');
  const ok = originalInner === extracted;
  console.log(`${b.file}: contenido idéntico al original = ${ok} (${Buffer.byteLength(extracted)} bytes)`);
  if (!ok) {
    allOk = false;
    let i = 0;
    while (i < Math.min(extracted.length, originalInner.length) && extracted[i] === originalInner[i]) i++;
    console.log('  primer diff char', i);
    console.log('  orig:', JSON.stringify(originalInner.slice(i - 60, i + 60)));
    console.log('  extr:', JSON.stringify(extracted.slice(i - 60, i + 60)));
  }
}

// El admin.html nuevo: cada link reemplaza al bloque; el <style> del template JS sigue.
const cur = fs.readFileSync('public/admin.html', 'utf8');
const linkCount = (cur.match(/<link rel="stylesheet" href="\/css\/admin\//g) || []).length;
const jsStyleStillThere = cur.includes('#modal-cobrar-cita * { box-sizing: border-box; }');
console.log('links css/admin =', linkCount, '(esperado 3)');
console.log('<style> dentro del template JS intacto =', jsStyleStillThere);

if (allOk && linkCount === 3 && jsStyleStillThere) {
  console.log('RESULTADO: extracción lossless verificada ✅');
} else {
  console.log('RESULTADO: FALLÓ ❌');
  process.exit(1);
}

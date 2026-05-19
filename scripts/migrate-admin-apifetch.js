// Paso 2 del refactor admin: introducir apiFetch sin cambiar comportamiento.
//   1. Inserta <script src="/js/admin/core/api.js"> antes del primer <script> inline.
//   2. Reemplaza SOLO el patrón estricto y uniforme:
//        fetch(<str|tmpl>, { credentials: 'include' })  ->  apiFetch(<str|tmpl>)
//      (equivalencia exacta por definición de apiFetch).
//   3. Verifica de forma REVERSIBLE 1:1: deshace ambos cambios y exige que el
//      resultado sea byte-idéntico al archivo previo. Si no, aborta.

import fs from 'node:fs';

const ADMIN = 'public/admin.html';
const pre = fs.readFileSync(ADMIN, 'utf8');

// Ancla única para insertar el helper: justo después del chart.js v4 vendor,
// antes del primer <script> inline.
const ANCHOR = '  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>\n';
const HELPER_LINE = '  <script src="/js/admin/core/api.js"></script>\n';
if (pre.indexOf(ANCHOR) === -1) throw new Error('No se encontró el ancla del helper');
if (pre.indexOf(HELPER_LINE) !== -1) throw new Error('El helper ya estaba insertado');

// Patrón estricto: arg = string simple ('...') o template (`...` sin backticks),
// opciones EXACTAMENTE { credentials: 'include' }, cierre `})`.
const STRICT = /fetch\((`[^`]*`|'[^']*'), \{ credentials: 'include' \}\)/g;
const matchCount = (pre.match(STRICT) || []).length;

// Aplicar cambios
let out = pre.replace(ANCHOR, ANCHOR + HELPER_LINE);
let swaps = 0;
out = out.replace(STRICT, (_m, arg) => { swaps++; return `apiFetch(${arg})`; });
fs.writeFileSync(ADMIN, out);

// --- VERIFICACIÓN REVERSIBLE 1:1 ---
// Deshacer swaps: apiFetch(<str|tmpl>) -> fetch(<str|tmpl>, { credentials: 'include' })
const REV = /apiFetch\((`[^`]*`|'[^']*')\)/g;
let reverted = out.replace(REV, (_m, arg) => `fetch(${arg}, { credentials: 'include' })`);
// Deshacer inserción del helper
reverted = reverted.replace(HELPER_LINE, '');

const lossless = reverted === pre;
console.log('=== EVIDENCIA ===');
console.log('patrón estricto encontrado:', matchCount);
console.log('reemplazos aplicados      :', swaps, '(debe ser igual ↑)');
console.log('helper <script> insertado :', out.includes(HELPER_LINE));
console.log('round-trip reversible === archivo previo:', lossless);
if (!lossless) {
  let i = 0;
  while (i < Math.min(reverted.length, pre.length) && reverted[i] === pre[i]) i++;
  console.log('  primer diff char', i);
  console.log('  pre:', JSON.stringify(pre.slice(i - 80, i + 80)));
  console.log('  rev:', JSON.stringify(reverted.slice(i - 80, i + 80)));
}
if (!lossless || swaps !== matchCount || swaps === 0) {
  fs.writeFileSync(ADMIN, pre); // rollback
  console.log('RESULTADO: FALLÓ ❌ (rollback aplicado, admin.html restaurado)');
  process.exit(1);
}
console.log('RESULTADO: migración a apiFetch verificada lossless ✅ (' + swaps + ' llamadas)');

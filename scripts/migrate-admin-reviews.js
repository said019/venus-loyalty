// Paso 4 (1/n) del refactor admin: mover la vista RESEÑAS a
// public/js/admin/views/reviews.js. Sección contigua y autocontenida
// (state reviewsCache/reviewsStats + 7 funciones), final del 2º <script>
// inline. MOVER, NO REESCRIBIR. Verificación reversible 1:1 (patrón paso 3).

import fs from 'node:fs';

const ADMIN = 'public/admin.html';
const VIEW = 'public/js/admin/views/reviews.js';
const pre = fs.readFileSync(ADMIN, 'utf8');

const START = '    /* ===== RESEÑAS ===== */';
const SCRIPT_CLOSE = '\n  </script>';
const UI_ANCHOR = '  <script src="/js/admin/core/ui.js"></script>\n';
const VIEW_LINE  = '  <script src="/js/admin/views/reviews.js"></script>\n';

const count = (s, sub) => s.split(sub).length - 1;
if (count(pre, START) !== 1) throw new Error('marcador RESEÑAS no es único');
if (count(pre, UI_ANCHOR) !== 1) throw new Error('ancla ui.js no es única');
if (pre.includes(VIEW_LINE)) throw new Error('reviews.js ya estaba insertado');

const startIdx = pre.indexOf(START);
const endIdx = pre.indexOf(SCRIPT_CLOSE, startIdx); // 1er </script> tras RESEÑAS = cierre script#2
if (!(startIdx >= 0 && endIdx > startIdx)) throw new Error('límites RESEÑAS inesperados');

const block = pre.slice(startIdx, endIdx); // contiguo, verbatim

// Sanidad: el bloque contiene el estado y las 7 funciones esperadas
const expect = [
  'let reviewsCache', 'let reviewsStats',
  'function loadReviews(', 'function renderReviewsStats(', 'function renderReviewsList(',
  'function renderReviewCard(', 'function filterReviews(', 'async function sendReviewReply(',
  'async function deleteReview(',
];
for (const e of expect) if (count(block, e) !== 1) throw new Error('bloque no contiene 1x ' + e);
// y NO debe contener </script> (no nos pasamos del límite)
if (block.includes('</script>')) throw new Error('el bloque cruzó un </script>');

// Aplicar: quitar bloque (script#2 cierra limpio) + insertar <script src reviews.js>
let out = pre.slice(0, startIdx) + pre.slice(endIdx);
out = out.replace(UI_ANCHOR, UI_ANCHOR + VIEW_LINE);

const HEADER =
`// Vista RESEÑAS del panel admin.
// Movida verbatim desde admin.html (paso 4 del refactor). Script clásico:
// funciones globales (window.*) -> los onclick="loadReviews()/filterReviews()"
// del HTML resuelven igual. reviewsCache/reviewsStats son estado privado de
// este script (solo lo usan estas funciones; verificado: sin refs externas).

`;
fs.writeFileSync(VIEW, HEADER + block);
fs.writeFileSync(ADMIN, out);

// --- VERIFICACIÓN REVERSIBLE 1:1 ---
let reverted = out.replace(VIEW_LINE, '');                 // quitar <script> insertado
reverted = reverted.slice(0, startIdx) + block + reverted.slice(startIdx); // reinsertar bloque

const lossless = reverted === pre;
console.log('=== EVIDENCIA ===');
console.log('bloque RESEÑAS movido (bytes):', Buffer.byteLength(block));
console.log('estado + 7 funciones presentes en el bloque: OK');
console.log('<script src reviews.js> insertado tras ui.js:', out.includes(UI_ANCHOR + VIEW_LINE));
console.log('reviewsCache/reviewsStats ya NO están en admin.html:', !out.includes('reviewsCache') && !out.includes('reviewsStats'));
console.log('funciones reviews ya NO están en admin.html:', !out.includes('function loadReviews(') && !out.includes('function sendReviewReply('));
console.log('onclick loadReviews/filterReviews siguen en el HTML (global):', out.includes('onclick="loadReviews()"') && out.includes('filterReviews(this.value)'));
console.log('round-trip reversible === archivo previo:', lossless);
if (!lossless) {
  let i = 0;
  while (i < Math.min(reverted.length, pre.length) && reverted[i] === pre[i]) i++;
  console.log('  primer diff char', i);
  console.log('  pre:', JSON.stringify(pre.slice(i - 80, i + 80)));
  console.log('  rev:', JSON.stringify(reverted.slice(i - 80, i + 80)));
  fs.writeFileSync(ADMIN, pre);
  console.log('RESULTADO: FALLÓ ❌ (rollback aplicado)');
  process.exit(1);
}
console.log('RESULTADO: vista RESEÑAS extraída lossless ✅');

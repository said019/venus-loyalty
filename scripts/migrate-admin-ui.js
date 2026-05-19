// Paso 3 del refactor admin: mover el núcleo de shell/navegación
// (openMobileMenu, closeMobileMenu, switchTab) a public/js/admin/core/ui.js.
// MOVER, NO REESCRIBIR: corte contiguo verbatim. Verificación reversible 1:1.

import fs from 'node:fs';

const ADMIN = 'public/admin.html';
const UI = 'public/js/admin/core/ui.js';
const pre = fs.readFileSync(ADMIN, 'utf8');

const START = '    // ===== FUNCIONES GLOBALES MENÚ MÓVIL =====';
const END   = '    // ===== FUNCIONES GLOBALES PARA BOTONES DEL MODAL DE CLIENTE =====';
const API_ANCHOR = '  <script src="/js/admin/core/api.js"></script>\n';
const UI_LINE     = '  <script src="/js/admin/core/ui.js"></script>\n';

// Unicidad / precondiciones
const count = (s, sub) => s.split(sub).length - 1;
if (count(pre, START) !== 1) throw new Error('marcador START no es único');
if (count(pre, END) !== 1) throw new Error('marcador END no es único');
if (count(pre, API_ANCHOR) !== 1) throw new Error('ancla api.js no es única');
if (pre.includes(UI_LINE)) throw new Error('ui.js ya estaba insertado');

const startIdx = pre.indexOf(START);
const endIdx = pre.indexOf(END);
if (!(startIdx < endIdx)) throw new Error('orden de marcadores inesperado');

const block = pre.slice(startIdx, endIdx); // contiguo, verbatim (incluye blank final)

// Sanidad: el bloque contiene exactamente las 3 funciones esperadas
for (const fn of ['function openMobileMenu(', 'function closeMobileMenu(', 'function switchTab(']) {
  if (count(block, fn) !== 1) throw new Error('el bloque no contiene 1x ' + fn);
}

// Aplicar: quitar bloque de admin.html + insertar <script src ui.js> tras api.js
let out = pre.slice(0, startIdx) + pre.slice(endIdx);
out = out.replace(API_ANCHOR, API_ANCHOR + UI_LINE);

const UI_HEADER =
`// Núcleo de shell/navegación del panel admin.
// Movido verbatim desde admin.html (paso 3 del refactor): menú móvil + switchTab.
// Script clásico: las funciones quedan globales (window.*) igual que antes,
// resolviendo los onclick="..." del HTML. Cargado antes de los <script> inline.

`;
fs.writeFileSync(UI, UI_HEADER + block);
fs.writeFileSync(ADMIN, out);

// --- VERIFICACIÓN REVERSIBLE 1:1 ---
let reverted = out.replace(UI_LINE, '');         // quitar el <script> insertado
const i2 = reverted.indexOf(END);                 // reinsertar bloque antes del marcador END
reverted = reverted.slice(0, i2) + block + reverted.slice(i2);

const lossless = reverted === pre;
console.log('=== EVIDENCIA ===');
console.log('bloque movido (bytes):', Buffer.byteLength(block));
console.log('funciones en el bloque: openMobileMenu, closeMobileMenu, switchTab (1x c/u): OK');
console.log('<script src ui.js> insertado tras api.js:', out.includes(API_ANCHOR + UI_LINE));
console.log('switchTab/openMobileMenu/closeMobileMenu ya NO están en admin.html:',
  !out.includes('function switchTab(') && !out.includes('function openMobileMenu(') && !out.includes('function closeMobileMenu('));
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
console.log('RESULTADO: extracción de shell/navegación verificada lossless ✅');

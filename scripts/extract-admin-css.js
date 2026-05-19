// Extrae los 3 bloques <style> de documento de public/admin.html a archivos
// externos, reemplazándolos in-place por <link> (preserva orden de cascada).
// NO toca el <style> que vive dentro de un template literal de JS (~22535).
// Mover, no reescribir: el contenido CSS se copia byte a byte.

import fs from 'node:fs';
import path from 'node:path';

const ADMIN = path.resolve('public/admin.html');
const CSS_DIR = path.resolve('public/css/admin');

// Bloques esperados (1-based, inclusive de las etiquetas <style>/</style>)
const BLOCKS = [
  { open: 19,    close: 5459,  openTag: '<style>',                            file: 'admin-base.css' },
  { open: 8158,  close: 10517, openTag: '<style>',                            file: 'admin-extra.css' },
  { open: 10519, close: 11415, openTag: '<style id="venus-admin-redesign">',  file: 'admin-redesign.css' },
];

const original = fs.readFileSync(ADMIN, 'utf8');
const lines = original.split('\n');

// 1. VERIFICAR marcadores antes de mutar nada
for (const b of BLOCKS) {
  const openLine = lines[b.open - 1];
  const closeLine = lines[b.close - 1];
  if (openLine.trim() !== b.openTag) {
    throw new Error(`Línea ${b.open} esperaba "${b.openTag}" pero tiene: ${JSON.stringify(openLine)}`);
  }
  if (closeLine.trim() !== '</style>') {
    throw new Error(`Línea ${b.close} esperaba "</style>" pero tiene: ${JSON.stringify(closeLine)}`);
  }
}

fs.mkdirSync(CSS_DIR, { recursive: true });

// 2. Extraer contenido (entre etiquetas, exclusivo) y reemplazar de abajo
//    hacia arriba para no invalidar índices.
let totalCssBytes = 0;
const sorted = [...BLOCKS].sort((a, b) => b.open - a.open);
for (const b of sorted) {
  const contentLines = lines.slice(b.open, b.close - 1); // entre <style> y </style>
  const css = contentLines.join('\n');
  totalCssBytes += Buffer.byteLength(css, 'utf8');
  fs.writeFileSync(path.join(CSS_DIR, b.file), css);

  const indent = lines[b.open - 1].match(/^\s*/)[0];
  const linkTag = `${indent}<link rel="stylesheet" href="/css/admin/${b.file}">`;
  // Reemplaza desde la línea <style> hasta </style> (inclusive) por 1 línea
  lines.splice(b.open - 1, b.close - b.open + 1, linkTag);
}

const out = lines.join('\n');
fs.writeFileSync(ADMIN, out);

// 3. EVIDENCIA de verificación
const docStyleOpens = (out.match(/^\s*<style/gm) || []).length; // debe quedar 0 a nivel línea
const inJsStyle = (out.match(/`\s*\n?\s*<style>/g) || out.match(/const html = `[\s\S]*?<style>/g) || []).length;
const linkCount = (out.match(/<link rel="stylesheet" href="\/css\/admin\//g) || []).length;

console.log('=== EVIDENCIA ===');
console.log('CSS bytes extraídos (suma 3 archivos):', totalCssBytes);
for (const b of BLOCKS) {
  const p = path.join(CSS_DIR, b.file);
  console.log(`  ${b.file}: ${fs.statSync(p).size} bytes`);
}
console.log('<style> a nivel de línea restantes en admin.html:', docStyleOpens, '(esperado 0)');
console.log('<link> css/admin insertados:', linkCount, '(esperado 3)');
console.log('admin.html líneas: antes', original.split('\n').length, '-> después', out.split('\n').length);
console.log('¿sigue existiendo el <style> dentro del template JS?:', out.includes('const html = `') && out.includes('#modal-cobrar-cita * { box-sizing: border-box; }'));

// Abrir /admin/caja o /admin/ventas escribiendo la URL mostraba la vista
// VACÍA para siempre: switchTab (ui.js) llamaba a loadCajaData() y
// loadReports(), que no existen en ninguna parte. Como cada llamada va
// guardada con `typeof X === 'function'`, el nombre equivocado no truena:
// simplemente no hace nada, sin un solo error en consola. Al hacer clic en
// la pestaña sí cargaba, porque ese camino es otro listener distinto — por
// eso el bug sobrevivió tanto.
//
// Esta prueba vigila la clase entera del bug: TODA función que switchTab
// intente llamar al abrir una pestaña debe existir de verdad.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const UI = 'public/js/admin/core/ui.js';

function archivosDeFrontend() {
  const fuentes = [fs.readFileSync('public/admin.html', 'utf8')];
  const raiz = 'public/js';
  const pila = [raiz];
  while (pila.length) {
    const dir = pila.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) pila.push(p);
      else if (e.name.endsWith('.js')) fuentes.push(fs.readFileSync(p, 'utf8'));
    }
  }
  return fuentes.join('\n');
}

// Nombres invocados con el patrón guardado `typeof X === 'function') X()`.
function cargadoresDeTab() {
  const src = fs.readFileSync(UI, 'utf8');
  return [...new Set([...src.matchAll(/typeof (\w+) === 'function'\)\s*\1\(/g)].map(m => m[1]))];
}

function existe(nombre, fuentes) {
  const patrones = [
    new RegExp(`\\b(?:async\\s+)?function\\s+${nombre}\\b`),
    new RegExp(`\\b${nombre}\\s*=\\s*(?:async\\s*)?(?:function|\\()`),
    new RegExp(`window\\.${nombre}\\s*=`),
  ];
  return patrones.some(p => p.test(fuentes));
}

test('toda función que switchTab llama al abrir una pestaña existe de verdad', () => {
  const fuentes = archivosDeFrontend();
  const faltantes = cargadoresDeTab().filter(n => !existe(n, fuentes));
  assert.deepEqual(
    faltantes, [],
    `switchTab llama a funciones que no existen: ${faltantes.join(', ')}. ` +
    `El guard \`typeof\` las silencia, así que la pestaña abierta por URL directa se queda vacía sin error.`
  );
});

test('cada pestaña con datos llama a su cargador real al abrirse por URL', () => {
  const src = fs.readFileSync(UI, 'utf8');
  // No basta con que la rama llame "algo": initReportsTab existe pero solo
  // llena dos campos de fecha. Aquí se nombra, por pestaña, la función que
  // de verdad pide los datos al servidor.
  const CARGADOR_REAL = {
    caja:         'cargarCaja',
    reports:      'cargarReportesMes',
    cards:        'loadCards',
    appointments: 'loadAppointments',
    services:     'loadServicesTable',
    requests:     'loadBookingRequests',
    notifications:'loadNotificationsHistory',
  };
  for (const [tab, fn] of Object.entries(CARGADOR_REAL)) {
    const desde = src.indexOf(`tabName === '${tab}'`);
    const resto = desde === -1 ? '' : src.slice(desde);
    const corte = resto.slice(1).search(/tabName === '|\} catch/);
    const rama = desde === -1 ? null : [null, resto.slice(0, corte > 0 ? corte : resto.length)];
    assert.ok(rama, `switchTab no tiene rama para la pestaña '${tab}'`);
    assert.match(
      rama[1], new RegExp(`\\b${fn}\\(`),
      `la pestaña '${tab}' no llama a ${fn}(): abierta por URL directa se queda vacía`
    );
  }
});

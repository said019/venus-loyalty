import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Carga router.js en un sandbox con mocks mínimos de browser.
// Devuelve los helpers puros expuestos en window.__adminRouter.
function loadRouter() {
  const src = fs.readFileSync('public/js/admin/core/router.js', 'utf8');
  const sandbox = {
    document: { addEventListener: () => {} },
    location: { pathname: '/admin' },
    history: { pushState: () => {}, replaceState: () => {} },
    addEventListener: () => {}, // para window.addEventListener('popstate', ...)
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.__adminRouter;
}

test('slugFromPath identifica slugs y rutas legacy', () => {
  const r = loadRouter();
  assert.equal(r.slugFromPath('/admin'), '');
  assert.equal(r.slugFromPath('/admin/'), '');
  assert.equal(r.slugFromPath('/admin.html'), '');
  assert.equal(r.slugFromPath('/admin/clientas'), 'clientas');
  assert.equal(r.slugFromPath('/admin/clientas/'), 'clientas');
  assert.equal(r.slugFromPath('/admin/foo'), 'foo');
  assert.equal(r.slugFromPath('/admin/clientas/123'), ''); // no match: rutas profundas
  assert.equal(r.slugFromPath('/otro'), '');
});

test('SLUG_TO_TAB cubre las pestañas del sidebar y es bijectivo con TAB_TO_SLUG', () => {
  const r = loadRouter();
  // NOTA: actualizar este array cuando se añada/quite una pestaña en
  // public/js/admin/core/router.js (mismo array SLUG_TO_TAB).
  const expected = [
    'inicio', 'solicitudes', 'agenda', 'caja', 'clientas',
    'mensajes', 'servicios', 'ventas', 'resenas', 'configuracion',
  ];
  assert.deepEqual(Object.keys(r.SLUG_TO_TAB).sort(), [...expected].sort());
  for (const [slug, tab] of Object.entries(r.SLUG_TO_TAB)) {
    assert.equal(r.TAB_TO_SLUG[tab], slug, `bijección rota en ${slug} ↔ ${tab}`);
  }
});

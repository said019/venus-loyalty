// Router de deep-linking para el panel admin.
// Mantiene la URL sincronizada con la pestaña activa via History API.
// NO modifica switchTab ni los handlers existentes: se acopla en paralelo
// con un listener delegado en capture phase. Slugs desconocidos y las rutas
// legacy /admin, /admin.html se normalizan a /admin/inicio (replaceState).

(function () {
  const SLUG_TO_TAB = {
    'inicio':        'overview',
    'solicitudes':   'requests',
    'agenda':        'appointments',
    'caja':          'caja',
    'clientas':      'cards',
    'mensajes':      'notifications',
    'gift-cards':    'events',
    'servicios':     'services',
    'ventas':        'reports',
    'resenas':       'reviews',
    'configuracion': 'settings',
  };
  const TAB_TO_SLUG = Object.fromEntries(
    Object.entries(SLUG_TO_TAB).map(function (e) { return [e[1], e[0]]; })
  );

  function slugFromPath(p) {
    var m = p.match(/^\/admin(?:\.html)?(?:\/([^\/?#]+))?\/?$/);
    return m ? (m[1] || '') : '';
  }

  // Expuesto SOLO para inspección/tests (no para uso productivo).
  window.__adminRouter = { SLUG_TO_TAB: SLUG_TO_TAB, TAB_TO_SLUG: TAB_TO_SLUG, slugFromPath: slugFromPath };

  // 1) Listener en CAPTURE phase: corre antes del handler del sidebar.
  //    Solo actualiza la URL; el listener existente sigue llamando switchTab.
  document.addEventListener('click', function (e) {
    var item = e.target && e.target.closest && e.target.closest('.sidebar-nav-item[data-tab], .mobile-nav-link[data-tab]');
    if (!item) return;
    var slug = TAB_TO_SLUG[item.dataset.tab];
    if (!slug) return;
    var desired = '/admin/' + slug;
    if (location.pathname !== desired) {
      history.pushState({ slug: slug }, '', desired);
    }
  }, true);

  // 2) Back / forward — re-sincroniza la pestaña visible con la URL.
  window.addEventListener('popstate', function () {
    var tab = SLUG_TO_TAB[slugFromPath(location.pathname)] || 'overview';
    if (typeof window.switchTab === 'function') window.switchTab(tab);
  });

  // 3) Initial load: abre pestaña según URL; normaliza /admin, /admin.html
  //    y slugs inválidos a /admin/inicio (sin recarga visible).
  document.addEventListener('DOMContentLoaded', function () {
    var slug = slugFromPath(location.pathname);
    var validSlug = slug && SLUG_TO_TAB[slug];
    if (!validSlug) {
      history.replaceState({ slug: 'inicio' }, '', '/admin/inicio');
    }
    var tab = SLUG_TO_TAB[validSlug ? slug : 'inicio'];
    if (typeof window.switchTab === 'function') window.switchTab(tab);
  });
})();

// Router de deep-linking para el panel admin.
// Mantiene la URL sincronizada con la pestaña activa via History API.
// NO modifica switchTab ni los handlers existentes: se acopla en paralelo
// con un listener delegado en capture phase. Slugs desconocidos y las rutas
// legacy /admin, /admin.html se normalizan a /admin/inicio (replaceState).

(function () {
  // Mapeo slug-de-URL → data-tab interno.
  // MANTENIMIENTO: al añadir/quitar una pestaña en admin.html, actualizar
  // este mapa Y el array `expected` en tests/admin-router.test.js.
  const SLUG_TO_TAB = {
    'inicio':        'overview',
    'solicitudes':   'requests',
    'agenda':        'appointments',
    'caja':          'caja',
    'clientas':      'cards',
    'mensajes':      'notifications',
    'servicios':     'services',
    'ventas':        'reports',
    'resenas':       'reviews',
    'configuracion': 'settings',
  };
  const TAB_TO_SLUG = Object.fromEntries(
    Object.entries(SLUG_TO_TAB).map(function (e) { return [e[1], e[0]]; })
  );
  // Slugs legacy que ahora viven como sub-tab dentro de otra pestaña.
  // {slug: { tab: 'parentTab', subtab: 'sub-id' }}.
  const SUBTAB_REDIRECTS = {
    'gift-cards': { tab: 'cards', subtab: 'cards-gift' },
  };

  function slugFromPath(p) {
    const m = p.match(/^\/admin(?:\.html)?(?:\/([^\/?#]+))?\/?$/);
    return m ? (m[1] || '') : '';
  }

  // Resuelve un cardId opcional embebido en /admin/clientas/:cardId.
  // Devuelve null si la URL no lo contiene.
  function cardIdFromPath(p) {
    const m = p.match(/^\/admin(?:\.html)?\/clientas\/([^\/?#]+)\/?$/);
    return m ? m[1] : null;
  }

  // Expuesto SOLO para inspección/tests (no para uso productivo).
  // Object.freeze hace machine-verifiable la intención "read-only".
  window.__adminRouter = Object.freeze({
    SLUG_TO_TAB: SLUG_TO_TAB,
    TAB_TO_SLUG: TAB_TO_SLUG,
    slugFromPath: slugFromPath,
    cardIdFromPath: cardIdFromPath,
  });

  // 1) Listener en CAPTURE phase: corre antes del handler del sidebar.
  //    Solo actualiza la URL; el listener existente sigue llamando switchTab.
  document.addEventListener('click', function (e) {
    const item = e.target && e.target.closest && e.target.closest('.sidebar-nav-item[data-tab], .mobile-nav-link[data-tab]');
    if (!item) return;
    const slug = TAB_TO_SLUG[item.dataset.tab];
    if (!slug) return;
    const desired = '/admin/' + slug;
    if (location.pathname !== desired) {
      history.pushState({ slug: slug }, '', desired);
    }
  }, true);

  // 2) Back / forward — re-sincroniza la pestaña visible con la URL.
  window.addEventListener('popstate', function () {
    const cardId = cardIdFromPath(location.pathname);
    if (cardId) {
      // /admin/clientas/:cardId — abrir la vista de expediente.
      if (typeof window.openExpedienteView === 'function') {
        window.openExpedienteView(cardId, { fromHistory: true });
      }
      return;
    }
    const tab = SLUG_TO_TAB[slugFromPath(location.pathname)] || 'overview';
    if (typeof window.switchTab === 'function') window.switchTab(tab);
  });

  // 3) Initial load: abre pestaña según URL; normaliza /admin, /admin.html
  //    y slugs inválidos a /admin/inicio (sin recarga visible).
  //    También resuelve slugs legacy que ahora son sub-tabs (ej. /admin/gift-cards
  //    → /admin/clientas con sub-tab cards-gift activo).
  document.addEventListener('DOMContentLoaded', function () {
    // Deep link directo al expediente de una clienta: /admin/clientas/:cardId
    const directCardId = cardIdFromPath(location.pathname);
    if (directCardId) {
      // Mostrar primero la lista (padre) para que el "back" tenga a dónde volver,
      // luego abrir la vista. switchTab se encarga de ocultar las demás.
      if (typeof window.switchTab === 'function') window.switchTab('cards');
      if (typeof window.openExpedienteView === 'function') {
        // Esperar un frame para que cardsCache esté disponible (lo carga loadCards).
        requestAnimationFrame(function () {
          window.openExpedienteView(directCardId, { fromHistory: true });
        });
      }
      return;
    }

    const slug = slugFromPath(location.pathname);
    const subRedirect = SUBTAB_REDIRECTS[slug];
    if (subRedirect) {
      const parentSlug = TAB_TO_SLUG[subRedirect.tab] || 'inicio';
      history.replaceState({ slug: parentSlug }, '', '/admin/' + parentSlug);
      if (typeof window.switchTab === 'function') window.switchTab(subRedirect.tab);
      // El handler de sub-tabs (en ui.js) escucha este custom event para
      // activar el sub-pane correcto sin requerir click.
      document.dispatchEvent(new CustomEvent('admin:activate-subtab', {
        detail: { subtab: subRedirect.subtab }
      }));
      return;
    }
    const validSlug = slug && SLUG_TO_TAB[slug];
    if (!validSlug) {
      history.replaceState({ slug: 'inicio' }, '', '/admin/inicio');
    }
    const tab = SLUG_TO_TAB[validSlug ? slug : 'inicio'];
    if (typeof window.switchTab === 'function') window.switchTab(tab);
  });
})();

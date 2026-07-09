// Núcleo de shell/navegación del panel admin.
// Movido verbatim desde admin.html (paso 3 del refactor): menú móvil + switchTab.
// Script clásico: las funciones quedan globales (window.*) igual que antes,
// resolviendo los onclick="..." del HTML. Cargado antes de los <script> inline.

    // ===== FUNCIONES GLOBALES MENÚ MÓVIL =====
    // Definidas al inicio para que estén disponibles para onclick en HTML
    function openMobileMenu() {
      console.log('👆 Abriendo menú móvil');
      const mobileMenu = document.getElementById('mobile-menu');
      if (mobileMenu) {
        mobileMenu.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeMobileMenu() {
      console.log('👆 Cerrando menú móvil');
      const mobileMenu = document.getElementById('mobile-menu');
      if (mobileMenu) {
        mobileMenu.classList.add('hidden');
        document.body.style.overflow = '';
      }
    }

    // ===== FUNCIÓN GLOBAL PARA CAMBIAR DE PESTAÑA =====
    function switchTab(tabId) {
      // Normalizar el ID (puede venir como 'tab-appointments' o solo 'appointments')
      const normalizedId = tabId.startsWith('tab-') ? tabId : 'tab-' + tabId;
      const tabName = normalizedId.replace('tab-', '');
      
      // Ocultar TODAS las secciones de tabs
      document.querySelectorAll('[id^="tab-"]').forEach(s => s.classList.add('hidden'));

      // Cerrar la vista de expediente si está abierta (no es un #tab-*)
      const expView = document.getElementById('expediente-view');
      if (expView && !expView.classList.contains('hidden')) {
        expView.classList.add('hidden');
        if (typeof window.closeExpedienteView === 'function') window.closeExpedienteView();
      }

      // Mostrar la sección objetivo
      const targetSection = document.getElementById(normalizedId);
      if (targetSection) {
        targetSection.classList.remove('hidden');
      }
      
      // Actualizar estado activo en sidebar
      document.querySelectorAll('.sidebar-nav-item').forEach(item => {
        item.classList.toggle('is-active', item.getAttribute('data-tab') === tabName);
      });
      
      // Actualizar estado activo en mobile nav
      document.querySelectorAll('.mobile-nav-link').forEach(a => {
        a.classList.toggle('is-active', a.getAttribute('data-tab') === tabName);
      });
      
      // Actualizar nav links legacy
      document.querySelectorAll('.nav a').forEach(a => a.classList.remove('is-active'));
      
      // Cargar datos del tab correspondiente
      try {
        if (tabName === 'overview') {
          if (typeof loadDashboardStats === 'function') loadDashboardStats();
          if (typeof startDashboardAutoRefresh === 'function') startDashboardAutoRefresh();
        } else if (tabName === 'cards') {
          if (typeof loadCards === 'function') loadCards(1);
          // Gift Cards ahora vive como sub-tab dentro de Clientas:
          // precargamos su data porque el usuario puede saltar al sub-tab.
          if (typeof loadGiftCardServices === 'function') loadGiftCardServices();
          if (typeof loadGiftCards === 'function') loadGiftCards();
        } else if (tabName === 'events') {
          // Legacy: alguien llamó switchTab('events'). Redirigimos a cards
          // y activamos el sub-pane Gift Cards.
          switchTab('cards');
          activateSubpane('cards-gift');
          return;
        } else if (tabName === 'requests') {
          if (typeof loadBookingRequests === 'function') loadBookingRequests();
          if (typeof initAgendarUrl === 'function') initAgendarUrl();
          if (typeof startRequestsAutoRefresh === 'function') startRequestsAutoRefresh();
        } else if (tabName === 'appointments') {
          if (typeof loadMonthAppointments === 'function') loadMonthAppointments();
          if (typeof loadAppointments === 'function') loadAppointments();
          if (typeof loadMonthStats === 'function') loadMonthStats();
          if (typeof startAppointmentsAutoRefresh === 'function') startAppointmentsAutoRefresh();
        } else if (tabName === 'services') {
          if (typeof loadServicesTable === 'function') loadServicesTable();
        } else if (tabName === 'settings') {
          if (typeof loadBusinessConfig === 'function') loadBusinessConfig();
          if (typeof loadNotificationsHistory === 'function') loadNotificationsHistory();
        } else if (tabName === 'caja') {
          if (typeof loadCajaData === 'function') loadCajaData();
        } else if (tabName === 'reports') {
          if (typeof loadReports === 'function') loadReports();
        } else if (tabName === 'notifications') {
          if (typeof loadNotificationsPanel === 'function') loadNotificationsPanel();
        }
      } catch(e) {
        console.warn('Error cargando datos del tab:', tabName, e);
      }
      
      // Scroll al top
      window.scrollTo(0, 0);
    }


    // ===== SUB-NAVEGACIÓN DENTRO DE UN TAB =====
    // Cada tab puede contener un grupo .subnav con botones .subnav-btn[data-subtab]
    // y los paneles correspondientes .subpane[data-subpane]. Solo un sub-pane
    // activo por grupo. activateSubpane(id) marca el botón y muestra el pane;
    // los demás del mismo grupo se ocultan.
    function activateSubpane(subtabId) {
      // Encontrar el botón objetivo (puede estar en cualquier tab)
      const btn = document.querySelector('.subnav-btn[data-subtab="' + subtabId + '"]');
      if (!btn) return;
      const group = btn.closest('.subnav');
      const tabSection = btn.closest('[id^="tab-"]');
      if (!group || !tabSection) return;
      // Botones del mismo grupo
      group.querySelectorAll('.subnav-btn').forEach(function (b) {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      // Panes del mismo tab section
      tabSection.querySelectorAll(':scope > .subpane, :scope > div > .subpane').forEach(function (p) {
        p.classList.toggle('is-active', p.getAttribute('data-subpane') === subtabId);
      });
    }
    window.activateSubpane = activateSubpane;

    // Wiring: delegado en document. Al clickear un .subnav-btn dentro de
    // cualquier tab, activa su sub-pane correspondiente.
    document.addEventListener('click', function (e) {
      const b = e.target && e.target.closest && e.target.closest('.subnav-btn[data-subtab]');
      if (!b) return;
      activateSubpane(b.dataset.subtab);
    });

    // Soporte para el router: cuando una URL legacy (ej /admin/gift-cards)
    // redirige a un tab con sub-tab, despacha 'admin:activate-subtab'.
    document.addEventListener('admin:activate-subtab', function (e) {
      const sub = e.detail && e.detail.subtab;
      if (sub) {
        // Esperar al siguiente frame para que el tab padre ya esté renderizado.
        requestAnimationFrame(function () { activateSubpane(sub); });
      }
    });

# Arquitectura del Panel Admin (Frontend)

> Documentación de cómo está armado HOY el panel de administración, y propuesta de reestructura.
> Fecha: 2026-05-19. Archivo analizado: `public/admin.html`.

---

## 1. Estado actual: todo en un solo archivo

El panel admin completo vive en **`public/admin.html`**: **24,917 líneas / 879 KB**. Un único archivo que contiene HTML, todo el CSS inline y todo el JavaScript inline. No usa framework (no React/Vue); es un SPA artesanal con cambio de pestañas por JS.

Para comparar, el resto de páginas son chicas (`index.html` 1,454 líneas, `skin-analysis.html` 2,304). El admin es **~17× la siguiente página más grande** y concentra casi toda la lógica de negocio del frontend.

### Anatomía del archivo (mapa de líneas)

| Líneas | Bloque | Tamaño aprox. | Contenido |
|---|---|---|---|
| 1–18 | `<head>` | 18 | Meta, fuentes, manifest PWA |
| **19–5459** | `<style>` #1 | **~5,400** | CSS principal: tema claro/oscuro, sidebar, tarjetas, layout |
| 5461–5466 | `<script src>` | — | Libs externas: html2canvas, html5-qrcode, chart.js |
| ~5467–8157 | HTML body | ~2,700 | Sidebar + contenedores de las 11 pestañas |
| **8158–10517** | `<style>` #2 | **~2,360** | CSS adicional (pagos, expedientes, etc.) |
| **10519–11415** | `<style id="venus-admin-redesign">` | **~900** | CSS de rediseño (parche encima del #1) |
| 12021–12024 | `<script src>` | — | Libs: qrcode, html5-qrcode, chart.js v4 |
| **12026–22014** | `<script>` #1 | **~10,000** | Lógica principal: 225 funciones |
| **22106–24913** | `<script>` #2 | **~2,800** | Caja/POS, reportes, Google Maps: ~50 funciones |

Totales: **~8,700 líneas de CSS** en 3 bloques (uno parcheando al otro) y **~12,800 líneas de JS** en 2 bloques con **322 funciones** en scope global.

---

## 2. Navegación y vistas

SPA con sidebar de `data-tab`; `switchTab(tabId)` (script #1, función ~línea 12048) muestra/oculta contenedores `#tab-*`.

**11 pestañas principales** (sidebar, líneas ~5487–5545):

| `data-tab` | Contenedor | Qué administra | Endpoints clave |
|---|---|---|---|
| `overview` | `#tab-overview` | Dashboard: métricas, KPIs, top clientes, gráficas | `/api/admin/metrics-month`, `/api/dashboard/today`, `/api/admin/top-clients` |
| `requests` | `#tab-requests` | Solicitudes de reserva (leads web) | `/api/booking-requests` |
| `appointments` | `#tab-appointments` | Citas (crear, editar, estado, calendario) | `/api/appointments*`, `/api/admin/calendar/*` |
| `caja` | `#tab-caja` | Cobros, caja, ventas rápidas | `/api/appointments/:id/payment`, `/api/direct-sales` |
| `cards` | `#tab-cards` | Tarjetas de lealtad + escáner QR + expedientes | `/api/admin/cards-firebase`, `/api/client-records/*` |
| `notifications` | `#tab-notifications` | Notificaciones internas + push | `/api/admin/notifications`, `/api/admin/push-*` |
| `events` | `#tab-events` | Historial de sellos/canjes | `/api/events/`, `/api/admin/stamp` |
| `services` | `#tab-services` (`#panel-services`, `#panel-products`) | Servicios y productos/inventario | `/api/services`, `/api/products` |
| `reports` | `#tab-reports` | Reportes de ventas filtrados | `/api/transactions`, `/api/dashboard/history` |
| `reviews` | `#tab-reviews` | Reseñas post-cita y respuestas | `/api/admin/reviews`, `/api/admin/reviews/:id/reply` |
| `settings` | `#tab-settings` | Config negocio, wallets, promo-2025, debug | `/api/admin/wallet-stats`, `/api/admin/promo-2025/*` |

Sub-navegación interna adicional con `switchTab('tab-...')` reusado para sub-paneles (servicios/productos, citas/solicitudes).

---

## 3. Grupos lógicos de JavaScript (módulos implícitos)

Las 322 funciones globales se agrupan, de facto, en estos dominios (ya están separadas por tema, solo que en el mismo archivo):

**Script #1 (225 funciones):**
- **Shell/UI:** `openMobileMenu`, `closeSidebar`, `switchTab`, scroll-lock de modales
- **Expedientes clínicos:** `openClientRecord`, `loadExpedienteData`, `renderExpedienteSessions/Photos`, `uploadExpPhotos`, `loadComparePhotos`, lightbox
- **Realtime/Polling:** `initFirebase`, `startPolling`, `cleanupListeners`
- **Métricas/Dashboard:** `loadMetrics`, `loadAdvancedKPIs`, `renderChart`, `loadTopClients`, `loadActivityChart`, `loadWalletStats`
- **Tarjetas/Lealtad:** `loadCards`, `startScan`/`handleScan` (QR), `getCurrentCardId`, `handleRedeemClick`
- **Gift cards:** `openGiftScanner`, `processGiftCardScan`
- **Promo 2025:** `analyzePromo2025`, `startPromo2025`, `pollAnalysis`
- **WhatsApp/Agenda:** `handleWhatsAppClick`, `handleScheduleClick`
- **Sesión:** `loadMe`, `downloadCSV`

**Script #2 (~50 funciones):**
- **Caja/POS:** `cargarCaja`, `abrirCobrarCita`, `procesarCobroCita`, `abrirVentaRapida`, `procesarVentaRapida`, `renderHistorialCaja`, `agregarProductoCobro`
- **Reportes:** `initReportsTab`, `aplicarFiltrosReporte`, `renderizarReporte`
- **Google Maps:** `loadGoogleMapsAPI` (autocompletado de direcciones)
- **Utilidades:** `getFechaMexico`, badges de estado/método de pago

**Librerías externas (CDN):** html2canvas 1.4.1, html5-qrcode 2.3.8, Chart.js (cargado **dos veces**: 3.x y 4.4.0), qrcode local. Fuentes Google (Playfair Display + DM Sans).

---

## 4. Problemas concretos de esta estructura

1. **Inmanejable:** 24,917 líneas en un archivo — editar una pestaña obliga a navegar todo; alto riesgo de romper algo no relacionado.
2. **CSS triplicado y en conflicto:** 3 bloques `<style>`, uno (`venus-admin-redesign`) parcheando al principal → reglas que se pisan, difícil saber cuál gana.
3. **322 funciones en scope global:** colisiones de nombres, sin módulos, sin tree-shaking.
4. **Chart.js cargado dos veces** (v3 línea 5466 y v4 línea 12024): peso y comportamiento inconsistente.
5. **879 KB sin minificar ni cachear bien:** `Cache-Control: no-store` en el head → se baja completo en cada visita; lento en móvil.
6. **Sin separación de responsabilidades:** vista, lógica de datos y llamadas API mezcladas en cada función.
7. **Imposible testear:** no hay forma de probar una función sin cargar todo el DOM.
8. **Git ruidoso:** cualquier cambio toca el mismo archivo gigante → diffs y conflictos enormes.
9. **Doble fuente de datos en el front:** convive `initFirebase`/polling Firestore con endpoints Prisma (`*-firebase` vs. REST) — coherente con el gap del backend.

---

## 5. Reestructura propuesta (sin implementar aún)

Objetivo: pasar de 1 archivo a una estructura modular **sin reescribir la lógica** (mover, no reescribir), manteniendo el SPA vanilla (sin introducir framework todavía).

### Estructura objetivo

```
public/
  admin.html                 # solo HTML: shell + contenedores de tabs + <link>/<script type=module>
  css/
    admin/
      base.css               # variables, tema claro/oscuro, tipografía
      layout.css             # sidebar, topbar, grid
      components.css          # tarjetas, modales, botones, badges
      views.css              # estilos específicos por pestaña
  js/
    admin/
      main.js                # bootstrap: router de tabs, sesión (loadMe), init
      core/
        api.js               # wrapper fetch (credentials, manejo de errores)
        ui.js                # switchTab, sidebar, modales, scroll-lock
        realtime.js          # polling / Firebase
      views/
        overview.js          # métricas, KPIs, gráficas
        requests.js          # leads / booking-requests
        appointments.js      # citas + calendario
        caja.js              # cobros, ventas rápidas
        cards.js             # lealtad + QR + expedientes
        notifications.js     # notificaciones + push
        events.js            # sellos/canjes
        services.js          # servicios + productos
        reports.js           # reportes
        reviews.js           # reseñas
        settings.js          # config, wallets, promo, debug
```

### Plan de migración incremental (orden recomendado, sin big-bang)

1. **CSS primero (bajo riesgo):** extraer los 3 bloques `<style>` a `css/admin/*.css`, consolidar el parche `venus-admin-redesign` dentro de las reglas base, dejar `<link>` en el HTML. Verificar visualmente pestaña por pestaña.
2. **Capa API:** crear `js/admin/core/api.js` con un wrapper `apiFetch(path, opts)` (ya hay ~60 llamadas `fetch('/api/...', {credentials:'include'})` repetidas). Reemplazar progresivamente.
3. **Core UI:** mover `switchTab`, sidebar y modales a `core/ui.js` como `type="module"`.
4. **Una vista a la vez:** extraer cada grupo de funciones a su `views/<tab>.js`, empezando por las más aisladas (`reviews`, `reports`, `events`) antes de las acopladas (`appointments`, `caja`, `cards`).
5. **Limpieza:** eliminar el Chart.js duplicado (dejar solo v4), revisar `Cache-Control` para permitir cachear los assets versionados.
6. **(Futuro, opcional)** una vez modularizado, evaluar build (Vite) o framework solo si el equipo lo justifica — no es requisito para ordenar.

### Reglas de la migración
- **Mover, no reescribir:** preservar el comportamiento; cada paso verificable visualmente.
- **Un dominio por commit:** diffs revisables, rollback simple.
- **Sin romper rutas:** el backend sigue sirviendo `/admin.html`; solo cambian sus `<link>`/`<script>`.
- **Resolver doble fuente Firestore/Prisma** alineado con el backend (consumir solo REST/Prisma).

---

## 6. Resumen

El panel admin funciona pero es un **monolito de 24,917 líneas** que mezcla HTML + 8,700 líneas de CSS (en 3 bloques que se pisan) + 12,800 líneas de JS (322 funciones globales). Ya está **lógicamente organizado por dominios** (las funciones están agrupadas por tema), lo que hace la reestructura **viable y de bajo riesgo si se hace incremental**: extraer CSS, crear capa API, y mover dominio por dominio a módulos `views/*.js`. No requiere framework ni reescritura — solo separación física y limpieza de duplicados.

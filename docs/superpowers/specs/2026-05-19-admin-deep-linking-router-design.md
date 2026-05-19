# Admin Deep-Linking Router — Design Spec

**Fecha:** 2026-05-19
**Autor:** Said Romero (con asistencia de Claude Code)
**Estado:** Aprobado, pendiente de plan de implementación

---

## Problema

Hoy el panel admin (`public/admin.html`, SPA con sidebar de 11 pestañas) **no tiene URLs por pestaña**. Compartir un link siempre abre la pestaña Inicio, sin importar dónde estuviera el usuario que lo copió.

**El usuario quiere** poder mandar "mira esta cita" o "revisa esta reseña" con un link directo a la pestaña correspondiente.

## No-objetivos

- **No** cambia la arquitectura SPA por multi-page real (recarga entre pestañas).
- **No** introduce framework (React/Vue/Astro/etc.).
- **No** modifica `switchTab` ni los listeners existentes.
- **No** rediseña la UI ni la navegación visual.
- **No** introduce lazy-loading por pestaña.
- **No** refactoriza el mobile menu (deuda técnica preexistente, queda igual).

## Solución

Router liviano client-side basado en History API. Mapea `/admin/<slug>` ↔ pestaña interna, sincroniza la URL con la navegación, sin recargar la página.

Tres cambios:

1. **Mapa de URLs** (slugs en español sin acentos ni ñ).
2. **Un handler nuevo en `server.js`** para que cualquier `/admin/<slug>` sirva `admin.html`.
3. **Un archivo nuevo `public/js/admin/core/router.js`** que se acopla en paralelo sin modificar el código existente.

## Mapa de URLs

| Sidebar (label) | `data-tab` interno | URL |
|---|---|---|
| Inicio | `overview` | `/admin/inicio` (default) |
| Solicitudes | `requests` | `/admin/solicitudes` |
| Agenda | `appointments` | `/admin/agenda` |
| Caja | `caja` | `/admin/caja` |
| Clientas | `cards` | `/admin/clientas` |
| Mensajes | `notifications` | `/admin/mensajes` |
| Gift Cards | `events` | `/admin/gift-cards` |
| Servicios | `services` | `/admin/servicios` |
| Ventas | `reports` | `/admin/ventas` |
| Reseñas | `reviews` | `/admin/resenas` |
| Configuración | `settings` | `/admin/configuracion` |

Reglas:
- `/admin` y `/admin.html` se normalizan a `/admin/inicio` vía `history.replaceState` (sin recarga, transparente al usuario).
- Slug desconocido (ej. `/admin/foo`) abre la pestaña Inicio **y** normaliza la URL a `/admin/inicio` vía `replaceState` (UX consistente: el usuario nunca queda con una URL inválida en la barra).

## Cambio en `server.js`

Una sola ruta nueva, justo después de los handlers existentes (`server.js:2217-2222`):

```js
// Soporta /admin/clientas, /admin/agenda, etc. (deep linking del SPA).
// El slug NO se valida aquí: el router del cliente decide qué pestaña abrir
// (cualquier slug desconocido cae en Inicio). Mismo guard de recepción.
app.get("/admin/:slug", redirectIfRecepcion, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
```

Justificación:
- **Mismo `redirectIfRecepcion`** que las rutas existentes → cero regresión del guard agregado en `f464229`.
- **Sin validación de slug en server** → única fuente de verdad de slugs válidos es el router cliente; evita mantener la lista en dos lugares.
- **`/admin/:slug` (un solo segmento)** y no `/admin/*` catch-all → más conservador para futuras subrutas profundas.
- **No modifica las rutas existentes** (`/admin`, `/admin.html`) → bookmarks viejos siguen funcionando idénticamente.

## Cliente: `public/js/admin/core/router.js`

Archivo nuevo, script clásico (~50 líneas), cargado tras `ui.js` y antes de `reviews.js` en `admin.html`. Se acopla por tres caminos independientes, **sin tocar `switchTab` ni los listeners existentes**:

### 1. Listener delegado en capture phase
```js
document.addEventListener('click', function (e) {
  const item = e.target.closest('.sidebar-nav-item[data-tab], .mobile-nav-link[data-tab]');
  if (!item) return;
  const slug = TAB_TO_SLUG[item.dataset.tab];
  if (!slug) return;
  const desired = '/admin/' + slug;
  if (location.pathname !== desired) {
    history.pushState({ slug }, '', desired);
  }
}, true); // capture: corre ANTES del listener del sidebar
```
**Solo actualiza la URL.** El listener existente del sidebar (`ui.js:42-50`) sigue llamando `switchTab` como siempre.

### 2. Back / forward
```js
window.addEventListener('popstate', function () {
  const tab = SLUG_TO_TAB[slugFromPath(location.pathname)] || 'overview';
  if (typeof window.switchTab === 'function') window.switchTab(tab);
});
```

### 3. Initial load (deep link)
```js
document.addEventListener('DOMContentLoaded', function () {
  const slug = slugFromPath(location.pathname);
  const validSlug = slug && SLUG_TO_TAB[slug];
  // Normaliza /admin, /admin.html y slugs inválidos a /admin/inicio
  if (!validSlug) {
    history.replaceState({ slug: 'inicio' }, '', '/admin/inicio');
  }
  const tab = SLUG_TO_TAB[validSlug ? slug : 'inicio'];
  if (typeof window.switchTab === 'function') window.switchTab(tab);
});
```

### Decisión clave: por qué NO monkey-patch de `switchTab`

Considerado y descartado. Envolver `switchTab` haría que **cualquier** llamada a `switchTab` actualice la URL — incluido código de inicialización que haga `switchTab('overview')` al cargar. Eso **sobrescribiría la URL del deep-link**: entrar a `/admin/clientas` y que se quede en `/admin/inicio`. Regresión real.

El listener en capture phase es defensivo: **solo el click humano cambia la URL**. Otras llamadas internas no la afectan. Es el comportamiento correcto.

### Inserción en `admin.html`

Una línea nueva, justo después de `ui.js`:

```html
<script src="/js/admin/core/api.js"></script>
<script src="/js/admin/core/ui.js"></script>
<script src="/js/admin/core/router.js"></script>   <!-- nuevo -->
<script src="/js/admin/views/reviews.js"></script>
```

## Bonus que entrega gratis
- ✅ Botón atrás/adelante del navegador funcionan entre pestañas.
- ✅ F5 mantiene la pestaña activa.
- ✅ El sidebar móvil también actualiza URL (el listener captura ambos selectores).
- ✅ `/admin` y `/admin.html` se normalizan a `/admin/inicio` sin reload visible.
- ✅ Bookmarks de pestañas concretas funcionan.

## Limitación honesta

El mobile menu (`admin.html:12198-12245`) **duplica la lógica de `switchTab`** en vez de llamarlo (deuda técnica preexistente, no introducida aquí). Consecuencia:
- El listener del router **sí actualiza la URL** cuando el usuario clickea en el mobile menu (porque captura el evento de click en `.mobile-nav-link[data-tab]`).
- Pero la pestaña que abre el mobile menu se sigue ejecutando por su propio camino, no por `switchTab`.

Resultado funcional: la URL móvil queda correcta y compartible. Si en el futuro se refactoriza el mobile menu para llamar `switchTab` (recomendable), el router seguirá funcionando sin cambios.

## Estrategia de verificación

Mismo rigor que los pasos previos del refactor.

**Server (curl, sin navegador):**
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin` → 200
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin.html` → 200
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/clientas` → 200
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/foo` → 200
- `curl -s http://localhost:3000/admin/clientas | head -1` → debe imprimir `<!DOCTYPE html>` (es admin.html)
- Como usuario rol "recepcion" en cookie: 302 → `/recepcion.html` (verifica que el guard sigue activo)

**Cliente (smoke manual en navegador, ~5 min):**
1. Abrir `/admin/clientas` directo → debe abrir la pestaña Clientas con sus datos cargados.
2. Click en otra pestaña (ej. Agenda) → URL cambia a `/admin/agenda` sin recarga.
3. Botón atrás del navegador → vuelve a Clientas, URL `/admin/clientas`.
4. F5 en `/admin/agenda` → recarga y se queda en Agenda.
5. Abrir `/admin/foo` (slug inválido) → abre Inicio y la URL se normaliza a `/admin/inicio` sin error visible.
6. Mobile view: abrir mobile menu, click una pestaña → URL actualiza y pestaña abre.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Listener de capture rompe algún flujo de click | Listener solo lee y hace `pushState` — no llama `preventDefault`, no detiene propagación. El handler del sidebar sigue corriendo en bubble phase. |
| Initialization code que llama `switchTab` sobreescribe el deep-link | Diseño NO envuelve `switchTab`; initialización no afecta URL. |
| Slug nuevo en sidebar sin entrada en `SLUG_TO_TAB` | Listener no encuentra mapping, retorna silencioso (no actualiza URL). La pestaña abre por el listener existente como siempre. No rompe nada; solo no actualiza URL hasta que se agregue al mapa. |
| Browser sin History API (IE) | No soportado — Venus usa navegadores modernos. |
| Crawlers/bots indexan `/admin/*` | El admin está detrás de login, no afecta SEO. |

## Out of scope (para futuras iteraciones)

- Deep linking dentro de pestañas (`/admin/clientas/<cardId>` para abrir un cliente específico).
- Lazy loading del JS por pestaña.
- Refactor del mobile menu para usar `switchTab`.
- Migración del SPA a multi-page server-rendered real.

## Plan de despliegue

Mismo flujo que el refactor anterior:
1. Rama: `feat/admin-deep-linking-router`.
2. 1 commit: server route + router.js + `<script>` tag en admin.html.
3. Verificación curl + checklist manual (5 min).
4. PR a `main` con descripción + checklist de QA visual.
5. Merge tras QA → Render auto-deploy.
6. Rollback simple si algo se rompe (es un commit aislado): `git revert <hash>`.

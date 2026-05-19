# Admin Deep-Linking Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir compartir URLs por pestaña del panel admin (`/admin/clientas`, `/admin/agenda`, etc.) sin recargar la página y sin modificar `switchTab` ni los handlers existentes.

**Architecture:** Una ruta nueva en `server.js` que sirve `admin.html` para `/admin/<slug>` con el guard de recepción existente. Un script clásico nuevo `router.js` que se acopla en paralelo (listener delegado en capture phase + popstate + initial sync con History API) sin modificar código existente.

**Tech Stack:** Node.js + Express, vanilla JS (sin framework), History API. Test runner: `node --test` (ya en uso por el proyecto). Spec: `docs/superpowers/specs/2026-05-19-admin-deep-linking-router-design.md`.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `server.js` (línea ~2223) | Modify (+5 líneas) | Sirve `admin.html` para `/admin/:slug` con el mismo guard que `/admin` |
| `public/js/admin/core/router.js` | Create (~55 líneas) | Router cliente: capture-click → pushState, popstate → switchTab, DOMContentLoaded → sync inicial + normalización de URL |
| `public/admin.html` (línea ~3331) | Modify (+1 línea) | Carga `router.js` después de `ui.js` |
| `tests/admin-router.test.js` | Create (~50 líneas) | Tests unitarios de helpers puros (`slugFromPath`, mapping bijectivo) ejecutados con `node --test` en sandbox `vm` |

---

## Task 1: Añadir ruta `/admin/:slug` en `server.js`

**Files:**
- Modify: `server.js` (insertar después de `server.js:2222`)

- [ ] **Step 1: Asegurar branch correcto**

```bash
git checkout feat/admin-deep-linking-router
git status
```
Expected: `On branch feat/admin-deep-linking-router`, working tree clean (la spec ya está commiteada en esta rama).

- [ ] **Step 2: Verificar baseline 404 para `/admin/clientas` (la ruta aún no existe)**

```bash
node server.js > /tmp/srv.log 2>&1 &
SRV=$!; sleep 4
echo -n "GET /admin/clientas → "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/clientas
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; rm -f /tmp/srv.log
```
Expected: `GET /admin/clientas → 404`.

- [ ] **Step 3: Insertar el handler nuevo en `server.js`**

Usar Edit en `server.js`. Reemplazar:
```js
app.get("/admin.html", redirectIfRecepcion, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("/admin-login.html", (_req, res) => {
```

por:
```js
app.get("/admin.html", redirectIfRecepcion, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
// Soporta /admin/clientas, /admin/agenda, etc. (deep linking del SPA).
// El slug NO se valida aquí: el router del cliente decide qué pestaña abrir
// (cualquier slug desconocido cae en Inicio). Mismo guard de recepción.
app.get("/admin/:slug", redirectIfRecepcion, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("/admin-login.html", (_req, res) => {
```

- [ ] **Step 4: Verificar que la nueva ruta responde 200 con admin.html**

```bash
node server.js > /tmp/srv.log 2>&1 &
SRV=$!; sleep 4
echo -n "GET /admin/clientas      → "; curl -s -o /tmp/c.html -w "%{http_code}\n" http://localhost:3000/admin/clientas
echo -n "GET /admin/foo (invalid) → "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/foo
echo -n "GET /admin (existente)   → "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin
echo -n "First line of response:   "; head -1 /tmp/c.html
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; rm -f /tmp/c.html /tmp/srv.log
```
Expected:
```
GET /admin/clientas      → 200
GET /admin/foo (invalid) → 200
GET /admin (existente)   → 200
First line of response:   <!DOCTYPE html>
```

- [ ] **Step 5: Verificar que el guard `redirectIfRecepcion` sigue activo en la ruta nueva**

```bash
TOK=$(node --input-type=module -e '
import "dotenv/config";
import jwt from "jsonwebtoken";
console.log(jwt.sign({ uid:"x", email:"r@x", role:"recepcion" }, process.env.ADMIN_JWT_SECRET));
')
node server.js > /tmp/srv.log 2>&1 &
SRV=$!; sleep 4
echo -n "GET /admin/clientas (rol recepcion) → "; curl -s -o /dev/null -w "%{http_code}\n" -b "adm=$TOK" http://localhost:3000/admin/clientas
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; rm -f /tmp/srv.log
```
Expected: `GET /admin/clientas (rol recepcion) → 302` (guard activo).

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(admin): /admin/:slug sirve admin.html (deep-linking)

Nueva ruta para el router de pestañas en el cliente. El slug no se
valida en server (el router cliente cae en Inicio si es desconocido).
Mismo guard redirectIfRecepcion que las rutas existentes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Tests + `router.js` + `<script>` tag

**Files:**
- Create: `tests/admin-router.test.js`
- Create: `public/js/admin/core/router.js`
- Modify: `public/admin.html` (insertar 1 línea tras `ui.js`)

- [ ] **Step 1: Escribir el test (TDD — falla primero porque router.js no existe)**

Create `tests/admin-router.test.js`:

```js
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

test('SLUG_TO_TAB cubre las 11 pestañas y es bijectivo con TAB_TO_SLUG', () => {
  const r = loadRouter();
  const expected = [
    'inicio', 'solicitudes', 'agenda', 'caja', 'clientas',
    'mensajes', 'gift-cards', 'servicios', 'ventas', 'resenas', 'configuracion',
  ];
  assert.deepEqual(Object.keys(r.SLUG_TO_TAB).sort(), [...expected].sort());
  for (const [slug, tab] of Object.entries(r.SLUG_TO_TAB)) {
    assert.equal(r.TAB_TO_SLUG[tab], slug, `bijección rota en ${slug} ↔ ${tab}`);
  }
});
```

- [ ] **Step 2: Correr el test — debe fallar (router.js no existe)**

```bash
node --test tests/admin-router.test.js 2>&1 | tail -15
```
Expected: error tipo `ENOENT: no such file or directory, open 'public/js/admin/core/router.js'`. `fail` count > 0.

- [ ] **Step 3: Crear `public/js/admin/core/router.js`**

Create `public/js/admin/core/router.js`:

```js
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
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
node --test tests/admin-router.test.js 2>&1 | tail -15
```
Expected: `tests 2`, `pass 2`, `fail 0`.

- [ ] **Step 5: Insertar `<script>` en `admin.html` después de `ui.js`**

Usar Edit en `public/admin.html`. Reemplazar:
```
  <script src="/js/admin/core/ui.js"></script>
  <script src="/js/admin/views/reviews.js"></script>
```

por:
```
  <script src="/js/admin/core/ui.js"></script>
  <script src="/js/admin/core/router.js"></script>
  <script src="/js/admin/views/reviews.js"></script>
```

- [ ] **Step 6: Verificar inserción y orden de carga**

```bash
grep -n "js/admin/core/\|js/admin/views/" public/admin.html | head -4
```
Expected (números de línea pueden variar ±1):
```
3330:  <script src="/js/admin/core/api.js"></script>
3331:  <script src="/js/admin/core/ui.js"></script>
3332:  <script src="/js/admin/core/router.js"></script>
3333:  <script src="/js/admin/views/reviews.js"></script>
```

- [ ] **Step 7: Smoke con curl — servidor sirve la nueva URL y el HTML incluye router.js**

```bash
node server.js > /tmp/srv.log 2>&1 &
SRV=$!; sleep 4
echo -n "GET /admin/clientas              → "; curl -s -o /tmp/c.html -w "%{http_code}\n" http://localhost:3000/admin/clientas
echo -n "GET /js/admin/core/router.js     → "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/js/admin/core/router.js
echo -n "<script src router.js> en HTML:    "; grep -c "js/admin/core/router.js" /tmp/c.html
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; rm -f /tmp/c.html /tmp/srv.log
```
Expected:
```
GET /admin/clientas              → 200
GET /js/admin/core/router.js     → 200
<script src router.js> en HTML:    1
```

- [ ] **Step 8: Commit**

```bash
git add public/js/admin/core/router.js public/admin.html tests/admin-router.test.js
git commit -m "feat(admin): router cliente para deep-linking (/admin/<slug>)

Router liviano vanilla JS con History API:
- listener delegado en capture phase actualiza URL al clickear pestañas
- popstate re-sincroniza en back/forward
- DOMContentLoaded abre la pestaña según la URL, normaliza /admin,
  /admin.html y slugs inválidos a /admin/inicio

No modifica switchTab ni los handlers existentes (se acopla en paralelo).
Tests unitarios de mapping y slugFromPath con node --test (sandbox vm).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: QA manual en navegador (~5 min)

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Levantar server local**

```bash
npm run dev
```
Esperar la línea `🚀 Servidor activo en http://localhost:3000`. **Dejar la terminal abierta.**

- [ ] **Step 2: Smoke de URLs**

Abrir cada URL en el navegador y verificar pestaña esperada + URL final tras DOMContentLoaded:

| URL inicial | Pestaña esperada | URL final |
|---|---|---|
| `http://localhost:3000/admin` | Inicio | `/admin/inicio` (normalizada) |
| `http://localhost:3000/admin.html` | Inicio | `/admin/inicio` (normalizada) |
| `http://localhost:3000/admin/clientas` | Clientas | `/admin/clientas` |
| `http://localhost:3000/admin/agenda` | Agenda | `/admin/agenda` |
| `http://localhost:3000/admin/resenas` | Reseñas | `/admin/resenas` |
| `http://localhost:3000/admin/foo` | Inicio | `/admin/inicio` (normalizada) |

- [ ] **Step 3: Smoke de interacción**

1. En `/admin/clientas`: click en sidebar "Agenda" → URL cambia a `/admin/agenda` **sin recarga**.
2. Botón **atrás** del navegador → vuelve a `/admin/clientas`, pestaña Clientas activa.
3. Botón **adelante** → vuelve a `/admin/agenda`.
4. **F5** en `/admin/agenda` → recarga, queda en Agenda.

- [ ] **Step 4: Console limpia**

DevTools → Console: **sin errores rojos**. Si hay alguno, copiar y volver a Task 2.

- [ ] **Step 5: Mobile menu (opcional)**

Redimensionar a ancho móvil (<768px), abrir menú móvil, click una pestaña → la URL actualiza. (La pestaña abre por el camino propio del mobile menu — preexistente; el router solo añade la actualización de URL.)

---

## Task 4: PR a `main`

- [ ] **Step 1: Push rama**

```bash
git push -u origin feat/admin-deep-linking-router
```

- [ ] **Step 2: Crear PR**

```bash
cat > /tmp/pr-router.md <<'EOF'
Spec: `docs/superpowers/specs/2026-05-19-admin-deep-linking-router-design.md`
Plan: `docs/superpowers/plans/2026-05-19-admin-deep-linking-router.md`

## Qué hace
Cada pestaña del panel admin tiene URL propia y compartible:
- `/admin/inicio`, `/admin/agenda`, `/admin/clientas`, `/admin/caja`, `/admin/resenas`, etc.
- `/admin` y `/admin.html` se normalizan a `/admin/inicio` sin recarga visible.
- Slugs desconocidos caen en Inicio + normalización.

Bonus gratis: botones atrás/adelante del navegador, F5 mantiene pestaña, bookmarks.

## Cómo
- 1 ruta nueva en `server.js` con el mismo guard `redirectIfRecepcion`.
- 1 script nuevo `public/js/admin/core/router.js` (~55 líneas).
- 1 línea de `<script>` en `admin.html` tras `ui.js`.
- Cero modificaciones a `switchTab` ni a los handlers existentes (se acopla en paralelo via listener en capture phase).

## Verificación
- Tests unitarios: `node --test tests/admin-router.test.js` (2/2 pass).
- curl: `/admin/clientas` → 200, `/admin/foo` → 200 (router cliente normaliza).
- Guard de recepción: cookie con role recepcion → 302 a `/recepcion.html` (sin regresión).
- QA visual manual en local (checklist en el plan, Task 3).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr create --base main --head feat/admin-deep-linking-router \
  --title "feat(admin): deep-linking router (/admin/<slug>)" \
  --body-file /tmp/pr-router.md
rm -f /tmp/pr-router.md
```

- [ ] **Step 3: Tras aprobar QA visual del PR, mergear (squash) y dejar que Render auto-deploye**

```bash
gh pr merge --squash --delete-branch
```

Expected: PR merged a main, branch borrado, Render dispara deploy automático.

---

## Self-Review

**Cobertura del spec:**
- ✅ Mapa de URLs (11 slugs): Task 2 Step 3 (`SLUG_TO_TAB`) + Task 2 Step 1 (test que asegura las 11 + bijección)
- ✅ Cambio en `server.js` con guard: Task 1 Step 3 + verificación Step 5
- ✅ `router.js` con 3 caminos (capture click, popstate, DOMContentLoaded): Task 2 Step 3
- ✅ Normalización de URL para `/admin`, `/admin.html`, slugs inválidos: Task 2 Step 3 (código) + Task 3 Step 2 (verificación visual)
- ✅ Inserción `<script>`: Task 2 Step 5 + verificación Step 6
- ✅ Limitación del mobile menu documentada: Task 3 Step 5

**Scan de placeholders:** ningún "TBD", "TODO", "implement later". Cada paso tiene comando o código exacto.

**Consistencia de tipos/nombres:** `SLUG_TO_TAB`, `TAB_TO_SLUG`, `slugFromPath`, `__adminRouter`, `switchTab` usados consistentemente entre router.js y los tests.

**Riesgo de cambio inesperado de números de línea:** Task 1 Step 3 y Task 2 Step 5 usan reemplazo por contexto (cadenas únicas alrededor) en vez de números de línea, así que el plan es robusto si `admin.html` o `server.js` cambian ligeramente entre tareas.

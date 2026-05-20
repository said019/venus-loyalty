# Integration Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar acceso machine-to-machine al backend de Venus mediante API key (`INTEGRATION_API_KEY`), exponer un namespace `/api/integrations/*` con un endpoint `ping` autenticado, y dejar el camino listo para los endpoints de negocio del Subproyecto B.

**Architecture:** Variable de entorno única (`INTEGRATION_API_KEY`) verificada con `crypto.timingSafeEqual`. Dos middlewares nuevos en `lib/auth.js` (`integrationAuth`, `integrationLogger`). Router separado en `src/routes/integrations.js` montado en `server.js` bajo `/api/integrations`. Fail-closed (503) si falta la env var. Tests con `node --test` (runner ya en uso) sin nuevas dependencias.

**Tech Stack:** Node.js + Express, `node:crypto` (built-in), `node:test`, `fetch` global (Node 18+). Spec: `docs/superpowers/specs/2026-05-20-integration-foundations-design.md`.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/auth.js` (líneas 1, 58) | Modify (+~35 líneas) | Añade `import crypto from 'node:crypto'` y los 2 middlewares (`integrationAuth`, `integrationLogger`) al final del módulo de auth |
| `src/routes/integrations.js` | Create (~15 líneas) | Router Express con un único endpoint `GET /ping` |
| `tests/integration-auth.test.js` | Create (~110 líneas) | 6 tests (4 auth + 1 logger + 1 router) que montan Express in-process |
| `server.js` (cerca de los otros `app.use` de routers) | Modify (+2 líneas) | Importa router/middlewares y monta `app.use("/api/integrations", integrationLogger, integrationAuth, integrationsRouter)` |
| `.env.example` | Modify (+2 líneas) | Documenta `INTEGRATION_API_KEY=` para que un nuevo dev sepa que existe |

---

## Task 1: Middleware `integrationAuth` + tests TDD

**Files:**
- Modify: `lib/auth.js`
- Create: `tests/integration-auth.test.js`

- [ ] **Step 1: Crear el archivo de tests con los 4 casos del middleware (red)**

Create `tests/integration-auth.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { integrationAuth } from '../lib/auth.js';

// Levanta una mini app Express con el middleware bajo prueba y un endpoint
// dummy /test que solo se alcanza si el middleware llama next().
async function startApp(mw) {
  const app = express();
  app.use(mw);
  app.get('/test', (_req, res) => res.json({ hit: true }));
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}/test`,
        close: () => new Promise(r => server.close(r)),
      });
    });
  });
}

test('integrationAuth: sin INTEGRATION_API_KEY → 503 INTEGRATION_DISABLED', async () => {
  delete process.env.INTEGRATION_API_KEY;
  const { url, close } = await startApp(integrationAuth);
  try {
    const res = await fetch(url);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'INTEGRATION_DISABLED');
  } finally { await close(); }
});

test('integrationAuth: con env, sin header → 401 UNAUTHORIZED', async () => {
  process.env.INTEGRATION_API_KEY = 'test-key-123';
  const { url, close } = await startApp(integrationAuth);
  try {
    const res = await fetch(url);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, 'UNAUTHORIZED');
  } finally { await close(); }
});

test('integrationAuth: con Bearer pero key incorrecta → 401', async () => {
  process.env.INTEGRATION_API_KEY = 'test-key-123';
  const { url, close } = await startApp(integrationAuth);
  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer wrong' } });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, 'UNAUTHORIZED');
  } finally { await close(); }
});

test('integrationAuth: con Bearer y key correcta → 200 + next() ejecuta handler', async () => {
  process.env.INTEGRATION_API_KEY = 'test-key-123';
  const { url, close } = await startApp(integrationAuth);
  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer test-key-123' } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).hit, true);
  } finally { await close(); }
});
```

- [ ] **Step 2: Correr tests — deben fallar (integrationAuth no existe aún)**

```bash
node --test tests/integration-auth.test.js 2>&1 | tail -10
```
Expected: error tipo `SyntaxError: The requested module '../lib/auth.js' does not provide an export named 'integrationAuth'`. `fail` > 0.

- [ ] **Step 3: Añadir `integrationAuth` a `lib/auth.js`**

Edit `lib/auth.js`. Reemplazar la línea 2:
```js
import jwt from "jsonwebtoken";
```
por:
```js
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
```

Y al final del archivo (después de la llave de cierre de `requireRole`, después de la línea `}`), añadir:
```js

// ===== Integraciones machine-to-machine (Claude / MCP / futuras) =====

// Verifica la API key del header `Authorization: Bearer <key>` contra
// process.env.INTEGRATION_API_KEY con comparación constante-en-tiempo.
// Fail-closed: si la env var no está seteada, rechaza todas las llamadas
// con 503 (evita abrir el namespace por un deploy mal configurado).
export function integrationAuth(req, res, next) {
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected) {
    return res.status(503).json({
      error: "INTEGRATION_DISABLED",
      message: "INTEGRATION_API_KEY no configurada",
    });
  }
  const hdr = req.headers.authorization || "";
  const presented = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  req.integration = { name: "claude" };
  next();
}
```

- [ ] **Step 4: Correr tests — los 4 deben pasar (green)**

```bash
node --test tests/integration-auth.test.js 2>&1 | tail -10
```
Expected: `tests 4`, `pass 4`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.js tests/integration-auth.test.js
git commit -m "feat(integration): integrationAuth middleware (API key Bearer)

Verifica Authorization: Bearer <key> contra INTEGRATION_API_KEY con
crypto.timingSafeEqual. Fail-closed: 503 INTEGRATION_DISABLED si la
env var no está seteada. 4 tests con node --test (sin nuevas deps).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Middleware `integrationLogger` + test

**Files:**
- Modify: `lib/auth.js` (append al final)
- Modify: `tests/integration-auth.test.js` (append 1 test)

- [ ] **Step 1: Añadir el test del logger (red)**

Append a `tests/integration-auth.test.js` al final del archivo:
```js

test('integrationLogger: emite 1 línea JSON con kind=integration tras finish', async () => {
  const lines = [];
  const orig = console.log;
  console.log = (msg) => lines.push(msg);
  let server;
  try {
    const { integrationLogger } = await import('../lib/auth.js');
    const app = express();
    app.use(integrationLogger);
    app.get('/test', (_req, res) => res.json({}));
    await new Promise(r => { server = app.listen(0, r); });
    const port = server.address().port;
    await fetch(`http://127.0.0.1:${port}/test`);
    // Espera al evento 'finish' del response
    await new Promise(r => setTimeout(r, 50));
    const parsed = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    const log = parsed.find(p => p.kind === 'integration');
    assert.ok(log, 'falta línea JSON con kind=integration');
    assert.equal(log.method, 'GET');
    assert.equal(log.path, '/test');
    assert.equal(log.status, 200);
    assert.equal(typeof log.ms, 'number');
    assert.ok(log.ts.endsWith('Z'), 'ts debe ser ISO UTC');
  } finally {
    console.log = orig;
    if (server) await new Promise(r => server.close(r));
  }
});
```

- [ ] **Step 2: Correr — debe fallar (logger no existe)**

```bash
node --test tests/integration-auth.test.js 2>&1 | tail -10
```
Expected: `fail` ≥ 1 con error tipo `does not provide an export named 'integrationLogger'`.

- [ ] **Step 3: Añadir `integrationLogger` a `lib/auth.js`**

Append a `lib/auth.js` (después de `integrationAuth`):
```js

// Log estructurado (1 línea JSON) por request al namespace de integraciones.
// Se monta ANTES de integrationAuth para que también registre 401/503.
// No registra body ni headers (privacidad).
export function integrationLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      kind: "integration",
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
    }));
  });
  next();
}
```

- [ ] **Step 4: Correr tests — los 5 deben pasar**

```bash
node --test tests/integration-auth.test.js 2>&1 | tail -10
```
Expected: `tests 5`, `pass 5`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.js tests/integration-auth.test.js
git commit -m "feat(integration): integrationLogger (1 línea JSON por request)

Estructurado (ts, kind=integration, method, path, status, ms).
Sin body ni headers. Se monta antes de integrationAuth para
capturar también 401/503.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Router `/api/integrations` con endpoint `ping`

**Files:**
- Create: `src/routes/integrations.js`
- Modify: `tests/integration-auth.test.js` (append 1 test end-to-end)

- [ ] **Step 1: Añadir test end-to-end del router (red)**

Append a `tests/integration-auth.test.js`:
```js

test('GET /api/integrations/ping con auth → 200 {ok, ts, version}', async () => {
  process.env.INTEGRATION_API_KEY = 'pong-key';
  const { integrationAuth, integrationLogger } = await import('../lib/auth.js');
  const { default: router } = await import('../src/routes/integrations.js');
  const app = express();
  app.use('/api/integrations', integrationLogger, integrationAuth, router);
  let server;
  try {
    await new Promise(r => { server = app.listen(0, r); });
    const port = server.address().port;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/integrations/ping`,
      { headers: { Authorization: 'Bearer pong-key' } }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.version, '1');
    assert.ok(!isNaN(new Date(body.ts).getTime()), 'ts debe ser parseable');
  } finally {
    if (server) await new Promise(r => server.close(r));
  }
});
```

- [ ] **Step 2: Correr — debe fallar (router no existe)**

```bash
node --test tests/integration-auth.test.js 2>&1 | tail -10
```
Expected: error tipo `Cannot find module '../src/routes/integrations.js'`.

- [ ] **Step 3: Crear `src/routes/integrations.js`**

Create `src/routes/integrations.js`:
```js
// Namespace de endpoints machine-to-machine (Claude / MCP).
// Auth: middleware integrationAuth montado en server.js.
// Log: middleware integrationLogger montado en server.js.

import { Router } from "express";

const router = Router();

// Health check del namespace. Útil para confirmar end-to-end que la
// API key funciona y el server está vivo. version sube cuando cambia
// el contrato de los endpoints de integración.
router.get("/ping", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), version: "1" });
});

export default router;
```

- [ ] **Step 4: Correr tests — los 6 deben pasar**

```bash
node --test tests/integration-auth.test.js 2>&1 | tail -10
```
Expected: `tests 6`, `pass 6`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/integrations.js tests/integration-auth.test.js
git commit -m "feat(integration): router /api/integrations con GET /ping

Endpoint inicial para validar end-to-end la API key, antes de añadir
endpoints de negocio del Subproyecto B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire en `server.js` + `.env.example`

**Files:**
- Modify: `server.js` (añadir import + montaje)
- Modify: `.env.example`

- [ ] **Step 1: Localizar dónde se montan los otros routers en server.js**

```bash
grep -nE "^app\.use\(\"/api/" server.js | head -10
```
Expected: lista de líneas donde se montan routers `/api/*`. Tomar nota de una de ellas para insertar nuestro montaje cerca (típicamente cerca de `/api/whatsapp` o donde están las imports de routers).

- [ ] **Step 2: Localizar el import de un router existente**

```bash
grep -nE "^import.*from \"\./src/routes/" server.js | head -5
```
Expected: lista de imports de routers existentes (ej. `import whatsappWebhook from "./src/routes/whatsappWebhook.js"`). Insertaremos nuestro import junto a estos.

- [ ] **Step 3: Añadir el import de `integrationsRouter` y los 2 middlewares**

Edit `server.js`. Localizar el bloque de imports de routers (donde aparecen los `import ... from "./src/routes/...js"`) y añadir UNA línea:
```js
import integrationsRouter from "./src/routes/integrations.js";
```

Localizar el import existente de `lib/auth.js` (cerca del top) y añadir `integrationAuth, integrationLogger` a los exports importados. Antes:
```js
import {
  adminAuth,
  signAdmin,
  setAdminCookie,
  clearAdminCookie,
  requireRole,
} from "./lib/auth.js";
```
Después:
```js
import {
  adminAuth,
  signAdmin,
  setAdminCookie,
  clearAdminCookie,
  requireRole,
  integrationAuth,
  integrationLogger,
} from "./lib/auth.js";
```

- [ ] **Step 4: Montar el router**

Edit `server.js`. Localizar UNA de las líneas `app.use("/api/...` que monten un router (por ejemplo `app.use("/api/whatsapp", whatsappWebhook);`). Insertar JUSTO DEBAJO:
```js
app.use("/api/integrations", integrationLogger, integrationAuth, integrationsRouter);
```

- [ ] **Step 5: Verificar boot del server (sin INTEGRATION_API_KEY → 503 al hacer ping)**

```bash
unset INTEGRATION_API_KEY
node server.js > /tmp/srv.log 2>&1 &
SRV=$!; sleep 4
echo -n "GET /api/integrations/ping (sin env) → "; curl -s -o /tmp/p.json -w "%{http_code}\n" http://localhost:3000/api/integrations/ping
echo "body:"; cat /tmp/p.json
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; rm -f /tmp/p.json /tmp/srv.log
```
Expected:
```
GET /api/integrations/ping (sin env) → 503
body:
{"error":"INTEGRATION_DISABLED","message":"INTEGRATION_API_KEY no configurada"}
```

- [ ] **Step 6: Verificar end-to-end con env seteada**

```bash
INTEGRATION_API_KEY=local-dev-key node server.js > /tmp/srv.log 2>&1 &
SRV=$!; sleep 4
echo -n "sin auth                    → "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/integrations/ping
echo -n "con Bearer wrong            → "; curl -s -o /dev/null -w "%{http_code}\n" -H 'Authorization: Bearer wrong' http://localhost:3000/api/integrations/ping
echo -n "con Bearer local-dev-key    → "; curl -s -o /tmp/p.json -w "%{http_code}\n" -H 'Authorization: Bearer local-dev-key' http://localhost:3000/api/integrations/ping
echo "body:"; cat /tmp/p.json
echo "--- logs JSON con kind=integration ---"
grep '"kind":"integration"' /tmp/srv.log | head -3
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; rm -f /tmp/p.json /tmp/srv.log
```
Expected:
```
sin auth                    → 401
con Bearer wrong            → 401
con Bearer local-dev-key    → 200
body:
{"ok":true,"ts":"2026-05-20T...","version":"1"}
--- logs JSON con kind=integration ---
{"ts":"...","kind":"integration","method":"GET","path":"/ping","status":401,"ms":...}
{"ts":"...","kind":"integration","method":"GET","path":"/ping","status":401,"ms":...}
{"ts":"...","kind":"integration","method":"GET","path":"/ping","status":200,"ms":...}
```

- [ ] **Step 7: Añadir `INTEGRATION_API_KEY` a `.env.example`**

Edit `.env.example`. Localizar una sección de variables (típicamente cerca de `ADMIN_JWT_SECRET` o `STAFF_USER`). Añadir:
```
# Clave para integraciones machine-to-machine (Claude / MCP / futuras).
# Generar con: openssl rand -hex 32
INTEGRATION_API_KEY=
```

- [ ] **Step 8: Commit**

```bash
git add server.js .env.example
git commit -m "feat(integration): monta /api/integrations en server + .env.example

Importa router + middlewares, monta con orden logger → auth → router.
.env.example documenta INTEGRATION_API_KEY con comando de generación.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: PR a `main`

**Files:** ninguno (solo git + gh).

- [ ] **Step 1: Verificar suite completa pasa**

```bash
node --test tests/admin-router.test.js tests/integration-auth.test.js tests/auth.test.js 2>&1 | tail -10
```
Expected: todos los `pass`, `fail 0`. (Verifica que tampoco rompimos tests pre-existentes.)

- [ ] **Step 2: Push rama**

```bash
git push -u origin feat/integration-foundations
```

- [ ] **Step 3: Crear PR**

```bash
cat > /tmp/pr-integ.md <<'EOF'
Spec: `docs/superpowers/specs/2026-05-20-integration-foundations-design.md`
Plan: `docs/superpowers/plans/2026-05-20-integration-foundations.md`

## Qué hace
Habilita acceso machine-to-machine al backend de Venus para Claude / MCP / futuras integraciones, mediante una API key.

Nuevo endpoint: `GET /api/integrations/ping`
Header: `Authorization: Bearer <INTEGRATION_API_KEY>`
Fail-closed: 503 `INTEGRATION_DISABLED` si la env var no está seteada en el server.

## Cómo
- `integrationAuth` middleware (`lib/auth.js`): verifica el Bearer con `crypto.timingSafeEqual`.
- `integrationLogger` middleware (`lib/auth.js`): 1 línea JSON estructurada por request (`kind=integration`).
- `src/routes/integrations.js`: router nuevo con `GET /ping → {ok, ts, version:"1"}`.
- `server.js`: monta `/api/integrations` con orden `logger → auth → router`.
- `.env.example`: documenta `INTEGRATION_API_KEY`.

Sin nuevas dependencias.

## Verificación automatizada
- Tests unitarios: `node --test tests/integration-auth.test.js` (6/6 pass — 4 auth + 1 logger + 1 end-to-end).
- Smoke local: 503 sin env, 401 sin/mal Bearer, 200 con Bearer correcto. Logs JSON visibles con `grep kind=integration`.

## QA post-merge
**ANTES del merge:** generar `INTEGRATION_API_KEY` (`openssl rand -hex 32`) y meterla en Render dashboard.

Tras deploy, correr:
```bash
KEY='<la-key-de-render>'
BASE='https://venus-loyalty.onrender.com'
curl -s -o /dev/null -w "sin auth       → %{http_code}\n" $BASE/api/integrations/ping
curl -s -o /dev/null -w "Bearer wrong   → %{http_code}\n" -H 'Authorization: Bearer wrong' $BASE/api/integrations/ping
curl -s -w "Bearer correcto → %{http_code}\n" -H "Authorization: Bearer $KEY" $BASE/api/integrations/ping
```
Esperado: 401, 401, 200 + `{"ok":true,...}`.

## Rollback
`git revert <merge-sha>` — namespace aislado, no toca ningún endpoint existente.

## Siguiente subproyecto
B: endpoints agregados de negocio (`cashflow`, `brief`, `sales/breakdown`, `customers/at-risk`, `call-list`) consumiendo este namespace.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF

gh pr create --base main --head feat/integration-foundations \
  --title "feat(integration): fundaciones M2M (API key + /api/integrations/ping)" \
  --body-file /tmp/pr-integ.md
rm -f /tmp/pr-integ.md
```

Expected: PR URL impresa.

- [ ] **Step 4: Confirmar estado del PR**

```bash
gh pr view --json number,state,url --jq '"PR #\(.number) state=\(.state) url=\(.url)"'
```
Expected: `PR #N state=OPEN ...`

---

## Self-Review

**Cobertura del spec (`2026-05-20-integration-foundations-design.md`):**

- ✅ Variable `INTEGRATION_API_KEY` (env) — Task 4 Step 7 (`.env.example`) + Task 4 Step 6 (uso real)
- ✅ Middleware `integrationAuth` con timingSafeEqual + fail-closed 503 — Task 1 Step 3 + Tests Step 1-4
- ✅ Middleware `integrationLogger` (JSON una línea, sin body, antes de auth) — Task 2 Step 3 + Test Step 1
- ✅ Router `src/routes/integrations.js` con `GET /ping → {ok, ts, version:'1'}` — Task 3 Step 3 + Test Step 1
- ✅ Wiring en `server.js` con orden `logger → auth → router` — Task 4 Step 3-4
- ✅ Header `Authorization: Bearer <key>` — testeado en Task 1 Step 1
- ✅ Comportamiento ante 4 casos (sin env / sin header / Bearer malo / Bearer bueno) — Task 1 Step 1
- ✅ Tests con `node --test` sin nuevas deps — usa `node --test` y `fetch` global
- ✅ `req.integration = { name: 'claude' }` — Task 1 Step 3 (en el código del middleware)
- ✅ Smoke curl post-deploy — Task 5 PR body lo documenta
- ✅ `.env.example` actualizado — Task 4 Step 7

**Placeholder scan:** sin "TBD", sin "implement later", sin "similar to Task N". Cada step tiene código o comando concreto.

**Type / name consistency:** `integrationAuth`, `integrationLogger`, `integrationsRouter`, `INTEGRATION_API_KEY`, `INTEGRATION_DISABLED`, `UNAUTHORIZED`, `kind: "integration"` usados consistentemente entre el código, los tests y la documentación.

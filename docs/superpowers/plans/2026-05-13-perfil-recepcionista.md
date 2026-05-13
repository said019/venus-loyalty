# Perfil de Recepcionista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un segundo rol "recepción" a Venus Loyalty con permisos operativos limitados y un panel dedicado `/recepcion.html` optimizado para tablet.

**Architecture:** Cookie JWT existente (`lib/auth.js`) extendido con campo `role`; middleware `requireRole(...allowed)` para endpoints sensibles; validaciones contextuales (cancelar cita pagada, descuentos POS, edición de notas previas) dentro de controladores. Admins almacenados en Firestore (no Prisma). UI nueva `/recepcion.html` con cinco pestañas (Hoy, Calendario, Cobrar, Clientas, WhatsApp); el resto reutiliza componentes del admin con flags `readOnly`.

**Tech Stack:** Node.js 20 + Express 5, Prisma (citas/ventas) + Firestore (admins), JWT cookie, vanilla JS + Bootstrap 5 frontend, `node:test` (built-in) para unit tests, smoke script con `fetch` para integración.

**Spec:** `docs/superpowers/specs/2026-05-13-perfil-recepcionista-design.md`

---

## File Structure

**Modificar:**
- `lib/auth.js` — agregar `requireRole`; embeber `role` en JWT; exponer `role` en `req.admin`
- `server.js`
  - `fsInsertAdmin`, `fsGetAdminByEmail` — soporte de campo `role`
  - `/api/admin/login` (≈línea 5457) — incluir `role` en token
  - `/api/admin/me` (≈línea 5490) — devolver `role`
  - `/api/appointments/:id/cancel` (≈línea 1764) — bloqueo si pagada y rol recepción
  - `/api/appointments/:id/payment` (≈línea 1084) — validar precio/descuento si rol recepción
  - `/api/direct-sales` (≈línea 1162) — idem
  - Endpoints de reportes / expenses / metrics — añadir `requireRole("admin")`
  - Endpoints de servicios/productos POST/PUT/DELETE — `requireRole("admin")`
- `lib/api/coffee-pos.js` — bloquear precio fuera de catálogo / descuento para rol recepción
- `src/routes/clientRecords.js` — bloquear PATCH/DELETE de sesión/foto para rol recepción
- `public/admin-login.js` — redirect según rol después de login
- `public/admin.js` — al bootstrap, si rol === "recepcion" redirigir a `/recepcion.html`

**Crear:**
- `scripts/seed-recepcion.js` — crear/resetear cuenta `recepcion@venus.local` con password por prompt
- `scripts/smoke-recepcion-permisos.js` — script de verificación: login como recepción + hits a cada endpoint bloqueado, espera 403
- `tests/auth.test.js` — unit tests de `requireRole` con `node:test`
- `public/recepcion.html` — HTML del panel recepción
- `public/recepcion.js` — JS del panel recepción (top bar, tabs, vista Hoy)
- `public/recepcion.css` — estilos (botones grandes, tablet-first)

**Sin cambios:**
- `prisma/schema.prisma` — no se modifica (admins viven en Firestore)

---

## Task 1: Extender `lib/auth.js` con role

**Files:**
- Modify: `lib/auth.js`

- [ ] **Step 1: Crear el test (TDD)**

Crear `tests/auth.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireRole, signAdmin } from "../lib/auth.js";
import jwt from "jsonwebtoken";

// Asegúrate de tener ADMIN_JWT_SECRET en .env o set en runtime
process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "test-secret";

function mockRes() {
  const res = {};
  res.status = (code) => { res._status = code; return res; };
  res.json = (body) => { res._body = body; return res; };
  return res;
}

test("signAdmin incluye role en el payload", () => {
  const token = signAdmin({ id: "a1", email: "x@y.z", role: "recepcion" });
  const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
  assert.equal(decoded.role, "recepcion");
});

test("signAdmin sin role usa 'admin' por defecto", () => {
  const token = signAdmin({ id: "a1", email: "x@y.z" });
  const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
  assert.equal(decoded.role, "admin");
});

test("requireRole bloquea si el rol no está en allowed", () => {
  const mw = requireRole("admin");
  const req = { admin: { role: "recepcion" } };
  const res = mockRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res._status, 403);
  assert.equal(res._body.error, "forbidden");
});

test("requireRole permite si el rol está en allowed", () => {
  const mw = requireRole("admin", "recepcion");
  const req = { admin: { role: "recepcion" } };
  const res = mockRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.equal(called, true);
});

test("requireRole bloquea si req.admin no existe", () => {
  const mw = requireRole("admin");
  const req = {};
  const res = mockRes();
  mw(req, res, () => {});
  assert.equal(res._status, 403);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test tests/auth.test.js`
Expected: FAIL — `requireRole is not a function`, `signAdmin` no firma `role`.

- [ ] **Step 3: Implementar los cambios en `lib/auth.js`**

Reemplazar el contenido de `lib/auth.js`:

```js
// lib/auth.js
import jwt from "jsonwebtoken";
import "dotenv/config";

const COOKIE_NAME = "adm";

export function signAdmin(user) {
  return jwt.sign(
    {
      uid: user.id,
      email: user.email,
      role: user.role || "admin"
    },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function setAdminCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearAdminCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function adminAuth(req, res, next) {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) return res.status(401).json({ error: "auth_required" });
    const payload = jwt.verify(raw, process.env.ADMIN_JWT_SECRET);
    req.admin = {
      uid: payload.uid,
      email: payload.email,
      role: payload.role || "admin"
    };
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.admin || !allowed.includes(req.admin.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test tests/auth.test.js`
Expected: PASS, los 5 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.js tests/auth.test.js
git commit -m "feat(auth): role en JWT y middleware requireRole"
```

---

## Task 2: Helper Firestore para rol + endpoint de login

**Files:**
- Modify: `server.js:128-147` (helpers admin) y `server.js:5457-5483` (login) y `server.js:5490-5492` (me)

- [ ] **Step 1: Extender helpers Firestore**

En `server.js`, reemplazar `fsInsertAdmin` (≈línea 138):

```js
async function fsInsertAdmin({ id, email, pass_hash, role = "admin" }) {
  const now = new Date().toISOString();
  await firestore.collection(COL_ADMINS).doc(id).set({
    id,
    email,
    pass_hash,
    role,
    createdAt: now,
    updatedAt: now,
  });
}
```

Agregar después de `fsUpdateAdminPassword` (≈línea 149-160):

```js
async function fsUpsertAdmin({ email, pass_hash, role }) {
  const norm = String(email).trim().toLowerCase();
  const existing = await fsGetAdminByEmail(norm);
  const now = new Date().toISOString();
  if (existing) {
    await firestore.collection(COL_ADMINS).doc(existing.id).update({
      ...(pass_hash ? { pass_hash } : {}),
      ...(role ? { role } : {}),
      updatedAt: now,
    });
    return existing.id;
  }
  const id = `adm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await fsInsertAdmin({ id, email: norm, pass_hash, role: role || "admin" });
  return id;
}
```

- [ ] **Step 2: Actualizar `/api/admin/login` para incluir role**

En `server.js`, reemplazar la línea 5475 (`const token = signAdmin(...)`) por:

```js
    const role = admin.role || "admin";
    const token = signAdmin({ id: admin.id, email: admin.email, role });
    setAdminCookie(res, token);

    res.json({ ok: true, role });
```

- [ ] **Step 3: Actualizar `/api/admin/me` para devolver role**

En `server.js`, reemplazar el handler de `/api/admin/me` (≈línea 5490-5492):

```js
app.get("/api/admin/me", adminAuth, (req, res) => {
  res.json({ uid: req.admin.uid, email: req.admin.email, role: req.admin.role });
});
```

- [ ] **Step 4: Verificación manual (smoke local)**

Si tienes el servidor corriendo (`npm run dev`):

```bash
# Login con tu cuenta admin actual y revisar respuesta
curl -i -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"TU_EMAIL","password":"TU_PASS"}' -c /tmp/cookies.txt

curl -s http://localhost:3000/api/admin/me -b /tmp/cookies.txt
```

Expected: `/api/admin/me` ahora devuelve `{"uid":"...","email":"...","role":"admin"}`. Login devuelve `{"ok":true,"role":"admin"}`.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(auth): role en login y /api/admin/me + fsUpsertAdmin"
```

---

## Task 3: Script seed de la cuenta recepción

**Files:**
- Create: `scripts/seed-recepcion.js`

- [ ] **Step 1: Crear el script**

Crear `scripts/seed-recepcion.js`:

```js
// scripts/seed-recepcion.js
// Uso: node scripts/seed-recepcion.js
// Crea o resetea la cuenta compartida "recepción".

import "dotenv/config";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import admin from "firebase-admin";

// Reusar la misma init que server.js hace via firebase-admin.
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString()
  );
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const firestore = admin.firestore();
const COL_ADMINS = "admins";
const EMAIL = "recepcion@venus.local";

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const pass = await rl.question("Password para recepcion@venus.local: ");
  rl.close();

  if (!pass || pass.length < 6) {
    console.error("La contraseña debe tener al menos 6 caracteres.");
    process.exit(1);
  }

  const pass_hash = await bcrypt.hash(pass, 10);
  const now = new Date().toISOString();

  const existing = await firestore
    .collection(COL_ADMINS)
    .where("email", "==", EMAIL)
    .limit(1)
    .get();

  if (!existing.empty) {
    const id = existing.docs[0].id;
    await firestore.collection(COL_ADMINS).doc(id).update({
      pass_hash,
      role: "recepcion",
      updatedAt: now,
    });
    console.log(`✓ Reseteada cuenta existente (${id}).`);
  } else {
    const id = `adm_recepcion_${Date.now()}`;
    await firestore.collection(COL_ADMINS).doc(id).set({
      id,
      email: EMAIL,
      pass_hash,
      role: "recepcion",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`✓ Creada cuenta nueva (${id}).`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Verificar que ejecuta**

Run: `node scripts/seed-recepcion.js`
Ingresar password (ej: `recepcion123`).
Expected: `✓ Creada cuenta nueva (...)`.

Verificar login:
```bash
curl -i -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"recepcion@venus.local","password":"recepcion123"}'
```
Expected: `200 OK`, body `{"ok":true,"role":"recepcion"}`.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-recepcion.js
git commit -m "feat(scripts): seed-recepcion para cuenta compartida"
```

---

## Task 4: Bloquear cancelación de citas pagadas para recepción

**Files:**
- Modify: `server.js:1764` (handler `/api/appointments/:id/cancel`)

- [ ] **Step 1: Añadir guardrail**

En `server.js`, dentro del handler `app.patch('/api/appointments/:id/cancel', adminAuth, async (req, res) => {`, justo después del bloque `if (!appointment)` (≈línea 1774), agregar:

```js
    // Guardrail: recepción no puede cancelar citas con pago registrado
    if (req.admin.role === "recepcion" && appointment.totalPaid != null) {
      return res.status(403).json({
        success: false,
        error: "paid_appointment_requires_admin",
      });
    }
```

- [ ] **Step 2: Verificación manual**

Con servidor corriendo, login como recepción → intentar cancelar una cita que tenga `totalPaid`:

```bash
curl -b /tmp/cookies-recepcion.txt -i \
  -X PATCH http://localhost:3000/api/appointments/<ID_PAGADA>/cancel
```
Expected: `403`, body `{"success":false,"error":"paid_appointment_requires_admin"}`.

Cancelar una NO pagada:
```bash
curl -b /tmp/cookies-recepcion.txt -i \
  -X PATCH http://localhost:3000/api/appointments/<ID_NO_PAGADA>/cancel
```
Expected: `200 OK`, `{"success":true}`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(recepcion): bloquear cancelación de citas pagadas"
```

---

## Task 5: Bloquear descuentos / precio fuera de catálogo en ventas directas

**Files:**
- Modify: `server.js:1162` (handler `/api/direct-sales`)

- [ ] **Step 1: Inspeccionar handler actual**

Run: `grep -A 80 "app.post.'/api/direct-sales'" /Users/saidromero/Documents/venus-loyalty/server.js | head -100`

Identificar dónde se leen `items`, `discount` y precios desde el body.

- [ ] **Step 2: Añadir validación de rol recepción**

Dentro del handler, antes de iterar items para crear la venta, agregar:

```js
    if (req.admin.role === "recepcion") {
      const discount = Number(req.body.discount || 0);
      if (discount > 0) {
        return res.status(403).json({ error: "discount_locked" });
      }
      const items = req.body.items || [];
      for (const item of items) {
        // Buscar el precio del catálogo (Product o Service)
        const productId = item.productId || item.id;
        if (productId) {
          const product = await prisma.product.findUnique({ where: { id: productId } }).catch(() => null);
          const service = product ? null : await prisma.service.findUnique({ where: { id: productId } }).catch(() => null);
          const catalogPrice = product ? Number(product.price) : (service ? Number(service.price) : null);
          if (catalogPrice != null && Number(item.unitPrice ?? item.price) !== catalogPrice) {
            return res.status(403).json({ error: "price_locked" });
          }
        }
      }
    }
```

> **Nota para el ingeniero:** Si los nombres exactos de campos difieren (`unitPrice` vs `price`, `productId` vs `id`), ajustar según la lectura real del handler en el paso 1. La lógica es: si el ítem trae un id de catálogo, su precio debe coincidir.

- [ ] **Step 3: Verificación manual**

Como recepción, intentar venta con descuento:

```bash
curl -b /tmp/cookies-recepcion.txt -i -X POST http://localhost:3000/api/direct-sales \
  -H "Content-Type: application/json" \
  -d '{"items":[],"discount":50}'
```
Expected: `403 discount_locked`.

Venta válida (precio de catálogo, sin descuento) debe pasar 200.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(recepcion): bloquear descuentos y precios fuera de catálogo en ventas"
```

---

## Task 6: Bloquear descuentos / precio en Coffee POS

**Files:**
- Modify: `lib/api/coffee-pos.js`

- [ ] **Step 1: Leer el router para localizar la creación de venta**

Run: `grep -n "router.post\|price\|discount\|unitPrice" /Users/saidromero/Documents/venus-loyalty/lib/api/coffee-pos.js`

Identificar el handler que crea `CoffeeSale` + `CoffeeSaleItem`.

- [ ] **Step 2: Añadir guardrails en el handler de venta**

Al inicio del handler `POST /sales` (o el equivalente que crea la venta), agregar:

```js
  if (req.admin.role === "recepcion") {
    const discount = Number(req.body.discount || 0);
    if (discount > 0) {
      return res.status(403).json({ error: "discount_locked" });
    }
    for (const item of (req.body.items || [])) {
      const variant = await prisma.coffeeProductVariant.findUnique({
        where: { id: item.variantId }
      }).catch(() => null);
      if (variant && Number(item.unitPrice ?? item.price) !== Number(variant.price)) {
        return res.status(403).json({ error: "price_locked" });
      }
    }
  }
```

- [ ] **Step 3: Aplicar `requireRole("admin")` al endpoint de corte de caja**

En el mismo archivo, localizar el endpoint que maneja `cash-session` (apertura/cierre o consulta de totales):

```bash
grep -n "cash-session\|cashSession" /Users/saidromero/Documents/venus-loyalty/lib/api/coffee-pos.js
```

Importar y aplicar:

```js
import { requireRole } from "../auth.js";
// ...
router.get('/cash-session/active', requireRole("admin"), async (req, res) => { ... });
router.post('/cash-session/open', requireRole("admin"), async (req, res) => { ... });
router.post('/cash-session/close', requireRole("admin"), async (req, res) => { ... });
```

> Ajustar a las rutas exactas que existan tras el `grep`.

- [ ] **Step 4: Verificación manual**

Como recepción:
```bash
curl -b /tmp/cookies-recepcion.txt -i http://localhost:3000/api/coffee/cash-session/active
```
Expected: `403 forbidden`.

Como admin: 200.

- [ ] **Step 5: Commit**

```bash
git add lib/api/coffee-pos.js
git commit -m "feat(recepcion): bloquear precios/descuentos y corte de caja en coffee POS"
```

---

## Task 7: `requireRole("admin")` en finanzas, reportes y dashboards

**Files:**
- Modify: `server.js` (múltiples endpoints)

- [ ] **Step 1: Importar `requireRole` en server.js**

Localizar la línea donde se importa `adminAuth, signAdmin, setAdminCookie, clearAdminCookie` (≈línea 64) y agregar `requireRole`:

```js
import {
  adminAuth,
  signAdmin,
  setAdminCookie,
  clearAdminCookie,
  requireRole,
} from "./lib/auth.js";
```

- [ ] **Step 2: Aplicar a endpoints de reportes / dashboard / metrics**

Para cada uno de los siguientes (basado en `grep -n "metrics\|dashboard\|transactions\|expenses"` en server.js), reemplazar `adminAuth` por `adminAuth, requireRole("admin")`:

- `/api/expenses` (GET, POST, PUT, DELETE) — líneas ≈2546, 2574, 2591, 2619, 2647
- `/api/transactions` (GET) — línea ≈1245
- `/api/admin/metrics-firebase` — línea ≈4145
- `/api/admin/metrics-month` — línea ≈4156
- `/api/admin/top-clients` — línea ≈4167
- `/api/admin/activity-week` — línea ≈4184
- `/api/admin/wallet-stats` — línea ≈4217
- `/api/admin/cards-firebase` — línea ≈4238
- `/api/admin/events-firebase` — línea ≈4328
- `/api/dashboard/today` — línea ≈4341
- `/api/dashboard/history` — línea ≈4390
- `/api/admin/fix-lastvisit` — línea ≈4277

Ejemplo concreto del cambio (uno):

```js
// antes
app.get('/api/expenses', adminAuth, async (req, res) => {

// después
app.get('/api/expenses', adminAuth, requireRole("admin"), async (req, res) => {
```

> Si dudas si un endpoint es de admin o operativo, la regla: **si muestra agregados de dinero, gastos, o totales, es admin-only.**

- [ ] **Step 3: Verificación manual**

Como recepción:
```bash
for path in /api/expenses /api/transactions /api/admin/metrics-firebase /api/dashboard/today; do
  echo "=== $path ==="
  curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/cookies-recepcion.txt "http://localhost:3000$path"
done
```
Expected: todos `403`.

Como admin: todos `200` (o el código exitoso original).

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(recepcion): requireRole admin en finanzas, dashboard y métricas"
```

---

## Task 8: `requireRole("admin")` en servicios y productos (escritura)

**Files:**
- Modify: `server.js` y `src/routes/api.js`

- [ ] **Step 1: server.js — endpoints de servicios y productos**

Aplicar `requireRole("admin")` a:

- `/api/services` POST (≈3078), PUT `/:id` (≈3112), DELETE `/:id` (≈3145)
- `/api/products` POST (≈809), PUT `/:id` (≈840), DELETE `/:id` (≈867), PATCH `/:id/stock` (≈879)

**Dejar GET sin restricción** (`/api/services` GET línea 3052, `/api/products` GET línea 790) — recepción los necesita para mostrar catálogo.

- [ ] **Step 2: src/routes/api.js — mismas restricciones**

En `src/routes/api.js`, ya hay `adminAuth` en services CRUD. Cambiar:

```js
// antes
router.post('/services', adminAuth, ServicesController.create);
router.put('/services/:id', adminAuth, ServicesController.update);
router.delete('/services/:id', adminAuth, ServicesController.delete);

// después
import { adminAuth, requireRole } from '../../lib/auth.js';
// ...
router.post('/services', adminAuth, requireRole("admin"), ServicesController.create);
router.put('/services/:id', adminAuth, requireRole("admin"), ServicesController.update);
router.delete('/services/:id', adminAuth, requireRole("admin"), ServicesController.delete);
```

- [ ] **Step 3: Verificación manual**

Como recepción:
```bash
curl -b /tmp/cookies-recepcion.txt -i -X POST http://localhost:3000/api/services \
  -H "Content-Type: application/json" -d '{"name":"test"}'
```
Expected: `403`.

Como recepción GET:
```bash
curl -b /tmp/cookies-recepcion.txt http://localhost:3000/api/services
```
Expected: `200` con lista (necesita poder leer catálogo).

- [ ] **Step 4: Commit**

```bash
git add server.js src/routes/api.js
git commit -m "feat(recepcion): servicios/productos solo lectura"
```

---

## Task 9: Bloquear edición / borrado de sesiones y fotos previas

**Files:**
- Modify: `src/routes/clientRecords.js`

- [ ] **Step 1: Inspeccionar el router**

Run:

```bash
grep -n "router\.\(post\|put\|patch\|delete\)" /Users/saidromero/Documents/venus-loyalty/src/routes/clientRecords.js
```

Identificar:
- Endpoints `POST` que **crean** (sesión nueva, foto nueva) → recepción permitida.
- Endpoints `PUT/PATCH/DELETE` sobre sesiones/fotos existentes → recepción bloqueada.

- [ ] **Step 2: Importar y aplicar `requireRole`**

En `src/routes/clientRecords.js`, importar y aplicar:

```js
import { adminAuth, requireRole } from '../../lib/auth.js';

// (mantén el router.use(adminAuth) actual)

// A los handlers PUT/PATCH/DELETE de sesiones/fotos existentes, añade requireRole("admin"):
router.patch('/sessions/:id', requireRole("admin"), async (req, res) => { /* ... */ });
router.delete('/sessions/:id', requireRole("admin"), async (req, res) => { /* ... */ });
router.patch('/photos/:id', requireRole("admin"), async (req, res) => { /* ... */ });
router.delete('/photos/:id', requireRole("admin"), async (req, res) => { /* ... */ });
```

> Adaptar a las rutas exactas que muestre el grep. Los `POST` (crear nueva sesión / nueva foto) quedan sin `requireRole` para que recepción pueda agregar.

- [ ] **Step 3: Verificación manual**

Como recepción, intentar editar una sesión existente:
```bash
curl -b /tmp/cookies-recepcion.txt -i -X PATCH \
  http://localhost:3000/api/client-records/sessions/<ID> \
  -H "Content-Type: application/json" -d '{"notes":"hack"}'
```
Expected: `403`.

Crear sesión nueva como recepción:
```bash
curl -b /tmp/cookies-recepcion.txt -i -X POST \
  http://localhost:3000/api/client-records/<CLIENT_ID>/sessions \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-05-13","notes":"check-in test"}'
```
Expected: `200/201`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/clientRecords.js
git commit -m "feat(recepcion): expediente add-only (sin editar/borrar previas)"
```

---

## Task 10: Smoke script de permisos end-to-end

**Files:**
- Create: `scripts/smoke-recepcion-permisos.js`

- [ ] **Step 1: Crear el script**

Crear `scripts/smoke-recepcion-permisos.js`:

```js
// scripts/smoke-recepcion-permisos.js
// Verifica el cuadro de permisos del rol recepción contra el servidor local.
// Uso: BASE=http://localhost:3000 RECEP_PASS=recepcion123 node scripts/smoke-recepcion-permisos.js

const BASE = process.env.BASE || "http://localhost:3000";
const EMAIL = "recepcion@venus.local";
const PASS = process.env.RECEP_PASS;
if (!PASS) { console.error("Falta RECEP_PASS"); process.exit(1); }

let cookie = "";

async function login() {
  const r = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!r.ok) throw new Error(`login fail ${r.status}`);
  const setCookie = r.headers.get("set-cookie") || "";
  cookie = setCookie.split(";")[0]; // "adm=...."
  const body = await r.json();
  if (body.role !== "recepcion") throw new Error(`role esperado recepcion, got ${body.role}`);
  console.log("✓ login recepción");
}

async function expectStatus(method, path, expected, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ok = r.status === expected;
  console.log(`${ok ? "✓" : "✗"} ${method} ${path} -> ${r.status} (esperaba ${expected})`);
  if (!ok) process.exitCode = 1;
}

async function run() {
  await login();

  // Bloqueados (403)
  await expectStatus("GET", "/api/expenses", 403);
  await expectStatus("GET", "/api/admin/metrics-firebase", 403);
  await expectStatus("GET", "/api/admin/top-clients", 403);
  await expectStatus("GET", "/api/dashboard/today", 403);
  await expectStatus("GET", "/api/coffee/cash-session/active", 403);
  await expectStatus("POST", "/api/services", 403, { name: "x", price: 1 });
  await expectStatus("POST", "/api/products", 403, { name: "x", price: 1 });
  await expectStatus("POST", "/api/direct-sales", 403, { items: [], discount: 50 });

  // Permitidos (200/2xx)
  await expectStatus("GET", "/api/services", 200);
  await expectStatus("GET", "/api/products", 200);
  await expectStatus("GET", "/api/appointments", 200);

  if (process.exitCode === 1) {
    console.error("\nFAIL: algún chequeo no cumplió la expectativa.");
    process.exit(1);
  }
  console.log("\nOK: permisos de recepción correctos.");
}

run().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr el script**

Con servidor en `localhost:3000`:

```bash
RECEP_PASS=recepcion123 node scripts/smoke-recepcion-permisos.js
```

Expected: todas las líneas con `✓`, mensaje final `OK: permisos de recepción correctos.`

Si algún `✗` aparece, revisar la task correspondiente.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-recepcion-permisos.js
git commit -m "test(recepcion): smoke script de permisos end-to-end"
```

---

## Task 11: Redirect de login según rol

**Files:**
- Modify: `public/admin-login.js`

- [ ] **Step 1: Localizar el handler de submit**

Run: `grep -n "login\|fetch.*admin/login\|location.href\|window.location" /Users/saidromero/Documents/venus-loyalty/public/admin-login.js | head -20`

Identificar el bloque que llama a `/api/admin/login` y redirige a `/admin.html`.

- [ ] **Step 2: Modificar el redirect**

Reemplazar el bloque que actualmente hace algo como:
```js
if (res.ok) window.location.href = "/admin.html";
```

Por:
```js
if (res.ok) {
  const data = await res.json().catch(() => ({}));
  window.location.href = data.role === "recepcion" ? "/recepcion.html" : "/admin.html";
}
```

- [ ] **Step 3: Verificación manual**

Abrir `/admin-login.html` en el navegador, login como admin → debe ir a `/admin.html`.
Cerrar sesión, login como recepción → debe ir a `/recepcion.html` (que aún no existe, mostrará 404; eso es esperado hasta Task 14).

- [ ] **Step 4: Commit**

```bash
git add public/admin-login.js
git commit -m "feat(recepcion): redirect de login según rol"
```

---

## Task 12: Bloquear acceso a /admin.html para rol recepción

**Files:**
- Modify: `public/admin.js`

- [ ] **Step 1: Localizar el bootstrap**

Run: `grep -n "/api/admin/me\|fetch.*me\|DOMContentLoaded" /Users/saidromero/Documents/venus-loyalty/public/admin.js | head -10`

Identificar dónde el panel admin valida la sesión al cargar.

- [ ] **Step 2: Añadir guard de rol**

Justo después del `fetch('/api/admin/me')` exitoso (donde se obtiene `data` con `uid/email`), agregar:

```js
if (data.role === "recepcion") {
  window.location.replace("/recepcion.html");
  return;
}
```

> Si el admin abre /admin.html y su rol es "admin", sigue su flujo normal. Solo se redirige si rol === "recepcion".

- [ ] **Step 3: Verificación manual**

Como recepción, intentar abrir `/admin.html` directo en navegador → debe redirigir a `/recepcion.html`.
Como admin: carga normal.

- [ ] **Step 4: Commit**

```bash
git add public/admin.js
git commit -m "feat(recepcion): redirigir /admin.html a /recepcion.html para rol recepcion"
```

---

## Task 13: Scaffolding de `/recepcion.html` (top bar + tabs)

**Files:**
- Create: `public/recepcion.html`
- Create: `public/recepcion.js`
- Create: `public/recepcion.css`

- [ ] **Step 1: HTML base**

Crear `public/recepcion.html`:

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Venus · Recepción</title>
  <link rel="icon" href="/assets/logo.png">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
  <link rel="stylesheet" href="/recepcion.css" />
</head>
<body>
  <header class="rec-topbar">
    <div class="rec-brand">
      <img src="/assets/logo.png" alt="Venus" />
      <span>Venus · Recepción</span>
    </div>
    <div class="rec-meta">
      <span id="recClock">--:--</span>
      <button id="recLogout" class="btn btn-sm btn-outline-light">Cerrar sesión</button>
    </div>
  </header>

  <nav class="rec-tabs" role="tablist">
    <button class="rec-tab active" data-tab="hoy">Hoy</button>
    <button class="rec-tab" data-tab="calendario">Calendario</button>
    <button class="rec-tab" data-tab="cobrar">Cobrar</button>
    <button class="rec-tab" data-tab="clientas">Clientas</button>
    <button class="rec-tab" data-tab="whatsapp">WhatsApp</button>
  </nav>

  <main class="rec-main">
    <section data-pane="hoy" class="rec-pane active">
      <div class="rec-counters" id="recCounters">Cargando…</div>
      <div class="rec-list" id="recCitasHoy"></div>
    </section>
    <section data-pane="calendario" class="rec-pane">
      <iframe src="/admin.html#calendario-embed" class="rec-frame" title="Calendario"></iframe>
    </section>
    <section data-pane="cobrar" class="rec-pane">
      <iframe src="/coffee-pos.html?role=recepcion" class="rec-frame" title="Cobrar"></iframe>
    </section>
    <section data-pane="clientas" class="rec-pane">
      <iframe src="/admin.html#clientas-embed" class="rec-frame" title="Clientas"></iframe>
    </section>
    <section data-pane="whatsapp" class="rec-pane">
      <iframe src="/admin.html#whatsapp-embed" class="rec-frame" title="WhatsApp"></iframe>
    </section>
  </main>

  <script src="/recepcion.js" type="module"></script>
</body>
</html>
```

> **Nota:** Usamos `iframe` apuntando a secciones del admin con hash. Las pestañas profundas (Calendario / Cobrar / Clientas / WhatsApp) reutilizan UI existente; los guardrails de servidor garantizan seguridad. Task 14 hace que Hoy sea funcional; Tasks 15-17 ajustan el admin para que respete los hash `#*-embed` y oculten lo prohibido (o redirigen).

- [ ] **Step 2: CSS base**

Crear `public/recepcion.css`:

```css
:root {
  --rec-bg: #3f4037;
  --rec-accent: #8c9668;
  --rec-fg: #ffffff;
  --rec-card-bg: #ffffff;
  --rec-muted: #6b7280;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f4f4f1; color: #222; }

.rec-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; background: var(--rec-bg); color: var(--rec-fg);
  position: sticky; top: 0; z-index: 10;
}
.rec-brand { display: flex; align-items: center; gap: 12px; font-weight: 600; }
.rec-brand img { width: 36px; height: 36px; border-radius: 50%; background: #fff; }
.rec-meta { display: flex; align-items: center; gap: 16px; }
.rec-meta #recClock { font-variant-numeric: tabular-nums; }

.rec-tabs {
  display: flex; gap: 4px; padding: 12px 20px; background: #ecebe6;
  position: sticky; top: 60px; z-index: 9;
}
.rec-tab {
  flex: 1; padding: 14px; border: 0; background: #fff; border-radius: 12px;
  font-weight: 600; font-size: 16px; cursor: pointer; min-height: 56px;
}
.rec-tab.active { background: var(--rec-accent); color: #fff; }

.rec-main { padding: 20px; }
.rec-pane { display: none; }
.rec-pane.active { display: block; }

.rec-counters {
  background: #fff; padding: 14px 18px; border-radius: 12px; margin-bottom: 16px;
  font-weight: 500;
}
.rec-list { display: grid; gap: 12px; }
.rec-card {
  background: #fff; padding: 18px; border-radius: 14px;
  display: grid; grid-template-columns: 80px 1fr auto; gap: 14px; align-items: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.rec-card .hora { font-size: 22px; font-weight: 700; }
.rec-card .cliente { font-size: 18px; font-weight: 600; }
.rec-card .servicio { color: var(--rec-muted); }
.rec-card .estado { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 13px; }
.rec-card .estado.pendiente { background: #fff3cd; color: #856404; }
.rec-card .estado.confirmada { background: #d1ecf1; color: #0c5460; }
.rec-card .estado.llego { background: #d4edda; color: #155724; }
.rec-card .estado.cobrada { background: #e2e3e5; color: #383d41; }
.rec-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.rec-actions .btn { min-height: 44px; padding: 8px 14px; }
.rec-actions .btn-disabled { opacity: 0.5; cursor: not-allowed; }

.rec-frame { width: 100%; height: calc(100vh - 200px); border: 0; border-radius: 12px; background: #fff; }

@media (max-width: 720px) {
  .rec-tabs { overflow-x: auto; }
  .rec-tab { flex: 0 0 auto; min-width: 100px; }
  .rec-card { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: JS base (top bar, tabs, logout)**

Crear `public/recepcion.js`:

```js
// public/recepcion.js
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function guardSession() {
  const r = await fetch("/api/admin/me");
  if (!r.ok) { window.location.replace("/admin-login.html"); return null; }
  const me = await r.json();
  if (me.role !== "recepcion" && me.role !== "admin") {
    window.location.replace("/admin-login.html"); return null;
  }
  return me;
}

function tickClock() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  $("#recClock").textContent = `${hh}:${mm}`;
}

function wireTabs() {
  $$(".rec-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      $$(".rec-tab").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".rec-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === tab));
    });
  });
}

function wireLogout() {
  $("#recLogout").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.replace("/admin-login.html");
  });
}

(async function init() {
  const me = await guardSession();
  if (!me) return;
  tickClock(); setInterval(tickClock, 30000);
  wireTabs();
  wireLogout();
  // Task 14 cargará citas de hoy aquí.
})();
```

- [ ] **Step 4: Verificación manual**

Login como recepción → debe ir a `/recepcion.html`, ver top bar con reloj y 5 tabs. Click en tabs cambia el pane activo. Logout funciona.

- [ ] **Step 5: Commit**

```bash
git add public/recepcion.html public/recepcion.js public/recepcion.css
git commit -m "feat(recepcion): scaffolding del panel /recepcion.html"
```

---

## Task 14: Vista "Hoy" — lista de citas del día con acciones

**Files:**
- Modify: `public/recepcion.js`

- [ ] **Step 1: Función para cargar citas de hoy**

Agregar en `public/recepcion.js`:

```js
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function loadCitasHoy() {
  const date = todayISO();
  const r = await fetch(`/api/appointments?date=${date}`);
  if (!r.ok) { $("#recCitasHoy").innerHTML = `<div class="alert alert-warning">No se pudieron cargar las citas.</div>`; return; }
  const citas = await r.json();
  renderCitas(Array.isArray(citas) ? citas : (citas.data || []));
}

function stateOf(c) {
  if (c.totalPaid != null) return "cobrada";
  if (c.status === "completed") return "llego";  // sin pago aún pero llegó
  if (c.status === "confirmed" || c.confirmedAt) return "confirmada";
  return "pendiente";
}

function renderCitas(citas) {
  // Counters
  const total = citas.length;
  const llegadas = citas.filter((c) => stateOf(c) === "llego" || stateOf(c) === "cobrada").length;
  const pendientes = citas.filter((c) => stateOf(c) === "pendiente").length;
  $("#recCounters").innerHTML =
    `Citas hoy: <b>${total}</b> · Llegaron: <b>${llegadas}</b> · Pendientes: <b>${pendientes}</b>`;

  // Cards
  const sorted = [...citas].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  $("#recCitasHoy").innerHTML = sorted.map((c) => {
    const st = stateOf(c);
    const isPaid = c.totalPaid != null;
    const cancelBtn = isPaid
      ? `<button class="btn btn-secondary btn-disabled" title="Cita pagada — solicita al admin">Cancelar</button>`
      : `<button class="btn btn-outline-danger" data-action="cancel" data-id="${c.id}">Cancelar</button>`;

    let actions = "";
    if (st === "pendiente" || st === "confirmada") {
      actions = `
        <button class="btn btn-success" data-action="checkin" data-id="${c.id}">✓ Check-in</button>
        <button class="btn btn-outline-primary" data-action="reschedule" data-id="${c.id}">📅 Reagendar</button>
        <button class="btn btn-outline-secondary" data-action="wa" data-phone="${c.clientPhone}">💬 WA</button>
        ${cancelBtn}`;
    } else if (st === "llego") {
      actions = `
        <button class="btn btn-primary" data-action="cobrar" data-id="${c.id}">💳 Cobrar</button>
        <button class="btn btn-outline-secondary" data-action="expediente" data-id="${c.id}">Ver expediente</button>`;
    } else if (st === "cobrada") {
      actions = `
        <button class="btn btn-outline-secondary" data-action="expediente" data-id="${c.id}">Ver expediente</button>
        <button class="btn btn-outline-secondary" data-action="wa" data-phone="${c.clientPhone}">💬 WA</button>`;
    }

    return `
      <article class="rec-card">
        <div class="hora">${c.time || "--:--"}</div>
        <div>
          <div class="cliente">${escapeHtml(c.clientName || "")}</div>
          <div class="servicio">${escapeHtml(c.serviceName || "")}</div>
          <div><span class="estado ${st}">${labelOf(st)}</span></div>
        </div>
        <div class="rec-actions">${actions}</div>
      </article>`;
  }).join("") || `<div class="alert alert-light">Sin citas hoy.</div>`;
}

function labelOf(st) {
  return { pendiente: "Pendiente", confirmada: "Confirmada", llego: "Llegó", cobrada: "Cobrada" }[st];
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
```

- [ ] **Step 2: Acciones de las cards**

Agregar listener delegado y handlers:

```js
function wireCitasActions() {
  $("#recCitasHoy").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn || btn.classList.contains("btn-disabled")) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === "checkin") {
      const r = await fetch(`/api/appointments/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (r.ok) loadCitasHoy(); else alert("No se pudo hacer check-in.");
    }

    if (action === "cancel") {
      if (!confirm("¿Cancelar esta cita?")) return;
      const r = await fetch(`/api/appointments/${id}/cancel`, { method: "PATCH" });
      if (r.status === 403) alert("Cita pagada — solicita al admin.");
      else if (r.ok) loadCitasHoy();
      else alert("No se pudo cancelar.");
    }

    if (action === "cobrar") {
      window.location.hash = "cobrar";
      $$(".rec-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "cobrar"));
      $$(".rec-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === "cobrar"));
    }

    if (action === "wa") {
      const phone = btn.dataset.phone;
      window.open(`https://wa.me/${String(phone).replace(/\D/g, "")}`, "_blank");
    }

    if (action === "reschedule") {
      // Cambia a tab Calendario; el admin embebido permite reagendar.
      $$(".rec-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "calendario"));
      $$(".rec-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === "calendario"));
    }

    if (action === "expediente") {
      // Abre la tab Clientas para que la recepción busque y abra el expediente.
      $$(".rec-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "clientas"));
      $$(".rec-pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === "clientas"));
    }
  });
}
```

- [ ] **Step 3: Llamar las funciones nuevas en init**

Reemplazar el bloque `init()` del archivo:

```js
(async function init() {
  const me = await guardSession();
  if (!me) return;
  tickClock(); setInterval(tickClock, 30000);
  wireTabs();
  wireLogout();
  wireCitasActions();
  loadCitasHoy();
  setInterval(loadCitasHoy, 60000); // refresca cada minuto
})();
```

- [ ] **Step 4: Verificación manual**

Login como recepción → vista Hoy muestra:
- Contadores correctos (total/llegaron/pendientes)
- Cards cronológicas con botones según estado
- Click en Check-in → cita pasa a "Llegó" y el botón Cobrar aparece
- Click en Cancelar sobre cita pagada → alerta "solicita al admin"
- Click en WA → abre wa.me con número de la clienta
- Click en Cobrar → cambia a tab Cobrar (POS)

- [ ] **Step 5: Commit**

```bash
git add public/recepcion.js
git commit -m "feat(recepcion): vista Hoy con citas, contadores y acciones por estado"
```

---

## Task 15: Asegurar que las pestañas embebidas no expongan acciones prohibidas

**Files:**
- Modify: `public/admin.js`, `public/admin.html`, `public/coffee-pos.js`

> **Estrategia:** el guardado real es el servidor (ya implementado). En el cliente, simplemente ocultamos los botones de "Reportes", "Gastos", "Cerrar caja", "Descuento", "Editar nota", "Borrar nota" cuando el rol es `recepcion`. Esto se hace en el bootstrap leyendo `/api/admin/me` y aplicando una clase `body.role-recepcion` que CSS oculta.

- [ ] **Step 1: Agregar clase de rol al body del admin**

En `public/admin.js`, en el bootstrap donde ya se llama `/api/admin/me`, **después** del guard que redirige al panel recepción si abre `/admin.html` (Task 12), agregar:

```js
document.body.classList.add(`role-${data.role}`);
```

(Recuerda: si rol === "recepcion" ya redirige; pero si el admin entra a /admin.html via iframe desde /recepcion.html con su sesión de recepción, el guard NO se ejecuta dentro del iframe porque el redirect del iframe no afecta al parent — verificar y, si redirige el iframe a sí mismo, eliminar el redirect cuando se detecte que está embebido. Ver paso 2.)

- [ ] **Step 2: Permitir admin.html embebido**

El iframe en `/recepcion.html` apunta a `/admin.html#calendario-embed` etc. El guard de Task 12 redirige a recepción.html si rol==="recepcion", lo que rompe el iframe. Ajustar el guard:

```js
// public/admin.js — reemplazar el guard de Task 12
if (data.role === "recepcion") {
  const embedded = window.self !== window.top || /#.*-embed$/.test(location.hash);
  if (!embedded) {
    window.location.replace("/recepcion.html");
    return;
  }
  // Si está embebido, marca el body para ocultar lo prohibido vía CSS
  document.body.classList.add("role-recepcion");
}
```

- [ ] **Step 3: CSS para ocultar elementos según rol**

En `public/admin.html` (o el CSS que use), agregar:

```css
/* Ocultar para recepción: reportes, gastos, cortes de caja, descuentos, ediciones de notas */
body.role-recepcion [data-role-hide~="recepcion"] { display: none !important; }

/* Inputs de precio en POS read-only */
body.role-recepcion .pos-price-input { pointer-events: none; background: #f1f1f1; }
```

Luego, en el HTML del admin, agregar `data-role-hide="recepcion"` a los elementos sensibles. Lista mínima:
- Tab/botón "Reportes"
- Tab/botón "Gastos"
- Botón "Cerrar caja" / "Abrir caja"
- Botón "Aplicar descuento" en POS
- Inputs de "Descuento" en formulario de cobro
- Botones "Editar nota" / "Borrar nota" / "Editar foto" en expediente
- Sección de totales acumulados del día

Run:
```bash
grep -n "Reportes\|Gastos\|Cerrar caja\|Descuento\|Editar nota\|Borrar" /Users/saidromero/Documents/venus-loyalty/public/admin.html | head -30
```

Para cada hit relevante, añadir `data-role-hide="recepcion"` al elemento contenedor.

- [ ] **Step 4: Verificación manual**

Login como recepción → /recepcion.html → click tab "Calendario" → el iframe muestra el calendario pero sin sidebar de Reportes/Gastos, sin botón "Cerrar caja".
Click tab "Cobrar" → POS sin botón "Descuento", inputs de precio grises.
Click tab "Clientas" → expediente sin botones editar/borrar en notas previas.

- [ ] **Step 5: Commit**

```bash
git add public/admin.js public/admin.html
git commit -m "feat(recepcion): ocultar acciones admin-only en vistas embebidas"
```

---

## Task 16: Self-review + correr smoke + handoff

- [ ] **Step 1: Correr el smoke script completo**

Asegurar servidor en `localhost:3000` con cuenta admin y cuenta recepción seeded.

```bash
RECEP_PASS=recepcion123 node scripts/smoke-recepcion-permisos.js
node --test tests/auth.test.js
```

Expected: smoke OK + unit tests OK.

- [ ] **Step 2: Checklist manual de UI**

- [ ] Login admin → /admin.html (sin cambios)
- [ ] Login recepción → /recepcion.html
- [ ] Recepción intenta abrir /admin.html directo → redirige a /recepcion.html
- [ ] Tab Hoy: contadores, cards con acciones correctas por estado
- [ ] Tab Hoy: cancelar cita pagada → toast "solicita al admin"
- [ ] Tab Hoy: check-in funciona, cita pasa a "Llegó"
- [ ] Tab Cobrar: sin botón Descuento, precios read-only
- [ ] Tab Clientas: notas viejas read-only, "+ Agregar nota" funciona
- [ ] Tab WhatsApp: lista de hilos, botón Responder, botón Enviar recordatorios
- [ ] Logout funciona, vuelve a admin-login

- [ ] **Step 3: Commit final de docs si hubo cambios**

```bash
git status
# Si hay archivos pendientes (CSS data-role-hide en admin.html), commitearlos:
git add -A
git commit -m "chore(recepcion): pulir guardrails UI tras smoke"
```

- [ ] **Step 4: Listo para deploy**

Antes de desplegar a producción:
1. En el entorno de producción, correr `node scripts/seed-recepcion.js` con una contraseña fuerte real.
2. Entregar credenciales a la recepción.
3. Monitorear logs por intentos 403 inesperados las primeras 48h.

---

## Self-Review

**Spec coverage:**
- §1 Identidad y auth → Tasks 1, 2, 3 ✓
- §2 Backend middleware + tabla permisos → Tasks 1, 4, 5, 6, 7, 8, 9 ✓
- §3 UI /recepcion.html → Tasks 11, 12, 13, 14, 15 ✓
- §4 Guardrails y edge cases → Tasks 4, 5, 6, 9, 12, 15 ✓
- §5 Testing y rollout → Tasks 1 (unit), 10 (smoke), 16 (manual + deploy) ✓

**Placeholder scan:** Sin TBD/TODO en pasos de código. Las únicas notas "ajustar según…" son advertencias al ingeniero cuando los nombres exactos de campos deben verificarse en el código real (paso 1 de Task 5 y Task 6) — esto es legítimo, no un placeholder; los pasos previos incluyen el `grep` exacto para obtener la info.

**Type consistency:** `req.admin.role` (string) consistente en todas las tareas. `requireRole(...allowed)` (variadic) consistente entre Task 1 (definición) y Tasks 7-9 (uso). `signAdmin({id, email, role})` consistente entre Task 1 (definición) y Task 2 (uso).

**Notas:**
- Tasks 5 y 6 piden al ingeniero `grep` antes de editar porque la lectura concreta de `req.body.items[*]` varía entre direct-sales y coffee POS. Esto es deliberado y seguro.
- Se asumió que admins viven en Firestore (verificado en el código existente). No se modifica `prisma/schema.prisma`.

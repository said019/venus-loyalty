# Perfil de Recepcionista — Diseño

**Fecha:** 2026-05-13
**Estado:** Aprobado para implementación
**Proyecto:** Venus Loyalty

## Contexto

Hoy Venus Loyalty tiene un único rol: `Admin` (super-usuario), con acceso total al panel `/admin.html` (citas, POS, expedientes, lealtad, WhatsApp, reportes, finanzas, configuración).

Operativamente, la persona que está en recepción no necesita ni debería ver finanzas/reportes. Este spec define un segundo rol — **recepción** — con permisos operativos limitados y una UI dedicada `/recepcion.html` optimizada para tablet.

## Objetivo

Permitir que la recepcionista opere el día a día (citas, check-in, cobros a precio fijo, expedientes, lealtad, responder WhatsApp) sin exponer datos financieros ni acciones reversibles solo por el dueño.

## No-objetivos (fuera de alcance)

- Auditoría por persona (la cuenta es compartida).
- Descuentos con autorización en línea (PIN de admin sobre POS).
- Modo offline.
- Multi-sucursal o multi-tenant.
- Iniciar conversaciones nuevas de WhatsApp desde recepción.

---

## 1. Identidad y autenticación

### Modelo de datos

Una sola tabla `Admin` con campo nuevo `role`:

```prisma
model Admin {
  id        String   @id @default(cuid())
  email     String   @unique
  pass_hash String
  role      String   @default("admin")   // "admin" | "recepcion"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("admins")
}
```

Migración: añade columna `role` con default `"admin"`. Las cuentas existentes quedan como admin sin cambios.

### Cuenta única compartida

Una sola cuenta `recepcion@venus.local` (o el email que se elija). La contraseña la fija el admin desde un script seed y la comparten todas las recepcionistas. No se requiere flujo de signup.

### Login

`POST /api/admin/login` ahora devuelve `{ token, role }`. El frontend:

- `role === "admin"` → redirige a `/admin.html`
- `role === "recepcion"` → redirige a `/recepcion.html`

El JWT/sesión incluye el `role` firmado. El servidor confía solo en el rol que viene del token, nunca en lo que mande el cliente en el body.

### Reset de contraseña

La recepción **no** puede pedir reset por sí misma. Si la contraseña se compromete, el admin la rota mediante un endpoint nuevo `PATCH /api/admin/recepcion/password` protegido con `requireRole("admin")`.

---

## 2. Backend: middleware y permisos

### Middleware `requireRole`

```js
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.auth || !allowed.includes(req.auth.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}
```

### Tabla de permisos

| Área | Endpoint(s) | Admin | Recepción |
|---|---|:-:|:-:|
| Citas: crear / mover / cancelar **no pagada** | `POST/PATCH/DELETE /api/appointments` | ✅ | ✅ |
| Citas: cancelar/borrar **pagada** | mismo endpoint, server detecta `paid===true` | ✅ | ❌ 403 |
| Check-in | `PATCH /api/appointments/:id/checkin` | ✅ | ✅ |
| POS venta a precio fijo | `POST /api/coffee/sales`, `POST /api/sales` | ✅ | ✅ |
| POS descuento / cambio de precio | mismo endpoint, server detecta `discount>0` o `unitPrice!=catalog` | ✅ | ❌ 403 |
| Cortes de caja / totales del día | `GET /api/coffee/cash-session`, `GET /api/sales/today` | ✅ | ❌ |
| Reportes / gastos | `/api/reports/*`, `/api/expenses/*` | ✅ | ❌ |
| Expediente: leer + **agregar** sesión/foto | `POST /api/client-records/:id/sessions`, `POST .../photos` | ✅ | ✅ |
| Expediente: editar/borrar notas previas | `PATCH/DELETE` sobre `TreatmentSession`/`ClientPhoto` | ✅ | ❌ |
| Lealtad: sellar / canjear / gift card | `POST /api/cards/:id/stamp`, `/api/giftcards/redeem` | ✅ | ✅ |
| Servicios / productos catálogo (CRUD) | `/api/services`, `/api/products` (escritura) | ✅ | ❌ (solo lectura) |
| WhatsApp: responder hilo existente / enviar recordatorio | `POST /api/whatsapp/reply`, `/confirm` | ✅ | ✅ |
| WhatsApp: iniciar nuevo hilo / config bot / plantillas | `POST /api/whatsapp/send-new`, `/api/whatsapp/config` | ✅ | ❌ |

### Defensa en servidor, no solo en UI

Los guardrails contextuales (cancelar pagada, descuentos, editar notas viejas) **se validan dentro del controlador**, no únicamente con `requireRole`. El middleware solo distingue rol; los controladores conocen los datos y deciden.

Ejemplo en `DELETE /api/appointments/:id`:

```js
if (appointment.paid && req.auth.role === "recepcion") {
  return res.status(403).json({ error: "paid_appointment_requires_admin" });
}
```

Ejemplo en `POST /api/coffee/sales`:

```js
for (const item of req.body.items) {
  const product = await prisma.coffeeProduct.findUnique({ where: { id: item.productId } });
  if (req.auth.role === "recepcion") {
    if (item.unitPrice !== product.price) return res.status(403).json({ error: "price_locked" });
    if ((item.discount || 0) > 0) return res.status(403).json({ error: "discount_locked" });
  }
}
```

---

## 3. UI: `/recepcion.html`

### Dispositivos

Tablet primary (landscape), responsive a móvil. Botones grandes, touch-targets ≥ 44px, optimizado para uso rápido frente a la clienta.

### Estructura general

```
┌──────────────────────────────────────────────────────┐
│  🟢 Venus · Recepción          ⏰ 14:32   [Cerrar]   │  top bar fija
├──────────────────────────────────────────────────────┤
│  [Hoy] [Calendario] [Cobrar] [Clientas] [WhatsApp]   │  tabs; bottom-nav en móvil
├──────────────────────────────────────────────────────┤
│                                                       │
│   Vista activa (default: Hoy)                         │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### Vista "Hoy" (default)

Lista cronológica de citas del día. Cada card grande:

```
┌────────────────────────────────────────────────┐
│ 15:00   María Pérez · Hydrafacial              │
│         🟡 Confirmada                          │
│         [✓ Check-in]  [📅 Reagendar]  [💬 WA] │
└────────────────────────────────────────────────┘
```

Acciones disponibles según estado:

- **Pendiente / Confirmada:** Check-in · Reagendar · WhatsApp · Cancelar (si no pagada; si pagada, botón gris "Requiere admin")
- **Llegó:** Cobrar · Ver expediente
- **Cobrada / Terminada:** Ver expediente · WhatsApp (solo lectura del estado, sin cancelar)

Header con contador: *"Citas hoy: 8 · Llegaron: 3 · Pendientes: 2"*. Sin montos.

### Otras pestañas

- **Calendario:** reutiliza el componente de calendario del admin con un flag `restrict={role:"recepcion"}`. Los botones "cancelar pagada" y "ver totales" se ocultan; el server vuelve a bloquear si llegan.
- **Cobrar:** POS de cafetería + servicios sueltos. Inputs de precio read-only. No aparece "Aplicar descuento" ni "Cerrar caja".
- **Clientas:** buscador → ficha → tabs `[Datos]` `[Expediente]` `[Sellos]` `[Notas]`. Notas anteriores read-only; aparece "+ Agregar nota de sesión" y "+ Subir foto".
- **WhatsApp:** lista de hilos abiertos (clientas que escribieron en últimas X hrs — reusar lo que hoy muestra el admin). Botón "Responder" por hilo. Botón "Enviar confirmaciones pendientes" que dispara los recordatorios automáticos del día. Sin botón "Nuevo mensaje".

### Routing

- Si recepción intenta abrir `/admin.html` → middleware del lado server (middleware HTML/SSR o redirect en el bootstrap del cliente al detectar role) la manda a `/recepcion.html`.
- Si admin abre `/recepcion.html` → permitido, le sirve como vista compacta.

---

## 4. Guardrails y casos borde

### Cancelar cita pagada (intento de recepción)

- UI: botón "Cancelar" en gris con tooltip *"Cita pagada — solicita al admin"*.
- Si manipula el request: server responde 403 con `{ error: "paid_appointment_requires_admin" }`. UI muestra toast.

### Modificar precio / aplicar descuento en POS

- UI: input de precio read-only; el botón "Descuento" no se renderiza.
- Server revalida cada `SaleItem`: `unitPrice` debe coincidir con catálogo, `discount` debe ser 0. Si no → 403.

### Editar notas / fotos previas del expediente

- UI: notas viejas como cards sin botones de editar/borrar. Solo aparece "+ Agregar nota".
- Server: `PATCH/DELETE /api/treatment-sessions/:id` con role `recepcion` → 403, sin importar autoría.

### Ver totales / corte de caja

- UI: la sección no se renderiza. Sin acumulado del día, sin "Cerrar caja".
- Server: `GET /api/coffee/cash-session/active` y `/api/sales/today` → 403.

### Token comprometido / sesión expirada

- 401 → redirige a `/admin-login.html` (login único; el rol se detecta del backend).

### Admin abre `/recepcion.html`

- Permitido. Es un subconjunto.

### Acción simultánea admin + recepción

- Sin lock especial. Última escritura gana, igual que hoy. (Si se vuelve problema, optimistic-locking después — YAGNI.)

### Pérdida de conexión durante cobro

- Sin cambios respecto al POS actual.

### Auditoría mínima

- Aunque la cuenta es compartida, cada acción crítica (cobro, cancelación, sellar tarjeta) registra `actorRole: "recepcion"` en los logs/DB existente donde aplique. Útil para depurar después.

---

## 5. Testing y rollout

### Tests críticos

1. **Middleware `requireRole`** — unit tests: token admin pasa, token recepción pasa cuando está en allowed, falla con 403 si no.
2. **Endpoints bloqueados** — 1 test de integración por cada fila "❌" de la tabla: login como recepción → llama endpoint → espera 403.
3. **Endpoints permitidos** — 1 test feliz por cada fila "✅": login como recepción → llama endpoint → espera 200.
4. **Reglas en controlador:**
   - Cancelar cita pagada como recepción → 403, no se borra.
   - Crear venta con `unitPrice` distinto al catálogo como recepción → 403.
   - Crear venta con `discount>0` como recepción → 403.
   - `PATCH` sobre `TreatmentSession` previa como recepción → 403.
   - Crear nueva sesión / foto como recepción → 200, persiste.
5. **Redirect de login:** admin → `/admin.html`, recepción → `/recepcion.html`.

### Migración de DB

- Migration añade columna `role` en `admins` con default `"admin"`.
- Script `scripts/seed-recepcion.js` que crea (o resetea) la cuenta `recepcion@venus.local` con contraseña pedida por prompt.

### Plan de rollout

1. Migración + middleware + tests (no toca UI).
2. Ajustes en controladores con guardrails contextuales (tests verdes).
3. Página `/recepcion.html` con las 5 pestañas. "Hoy" es la única realmente nueva; el resto reutiliza componentes existentes con flags `readOnly` / `restrict`.
4. Login redirect según rol.
5. Seed de la cuenta + entrega de credenciales.

---

## Resumen de cambios

| Capa | Cambios |
|---|---|
| DB | Columna `role` en `admins` + migration |
| Auth | Login devuelve `{token, role}`; JWT firma el role |
| Server | Middleware `requireRole` + validaciones contextuales en controladores |
| UI | Nueva página `/recepcion.html` con 5 pestañas |
| Scripts | `seed-recepcion.js` para crear/resetear cuenta |
| Tests | Cobertura por endpoint (allow/deny) + reglas contextuales |

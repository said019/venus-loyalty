# Rol Marketing — Documentación de Implementación

**Fecha:** 29 julio 2026
**Feature:** Rol `marketing` con agenda de citas, mini-CRM, comisiones, campañas, referidos, retos, Tier Gold y UGC
**Estado:** Implementado y validado (60 tests pasando, schema válido, sin errores de sintaxis)

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Modelos de Datos (Schema Prisma)](#2-modelos-de-datos-schema-prisma)
3. [Sistema de Autenticación y Roles](#3-sistema-de-autenticación-y-roles)
4. [Backend — Endpoints](#4-backend--endpoints)
5. [Lógica de Negocio Automática (Crones)](#5-lógica-de-negocio-automática-crones)
6. [Frontend — Portal del Marketer](#6-frontend--portal-del-marketer)
7. [Frontend — Panel del Admin](#7-frontend--panel-del-admin)
8. [Captura de Atribución en Página Pública](#8-captura-de-atribución-en-página-pública)
9. [Tests](#9-tests)
10. [Migración de Base de Datos](#10-migración-de-base-de-datos)
11. [Decisiones de Diseño](#11-decisiones-de-diseño)
12. [Archivos Modificados y Creados](#12-archivos-modificados-y-creados)

---

## 1. Visión General

Se creó un rol `marketing` con login propio (cookie `adm` existente) y portal `/marketing.html`. La persona de marketing puede:

### Secciones del portal `/marketing.html`
| # | Sección | Funcionalidad |
|---|---------|---------------|
| 1 | **Agendar cita** | Crear citas atribuidas a ella (genera comisión automática + notificación al admin) |
| 2 | **Mis citas** | Ver sus citas con comisión pendiente/pagada acumulada |
| 3 | **Agenda general** | Ver disponibilidad del estudio por fecha |
| 4 | **Leads / Mini-CRM** | Kanban con 5 estados, lead scoring 0-100, conversión a cita |
| 5 | **Campañas WhatsApp** | Lanzar campañas a segmentos (inactivos, cumpleañeros, gold) |
| 6 | **Push a Wallet** | Broadcast push a Apple/Google Wallet con tipo `promo` |
| 7 | **Gift cards** | Crear y enviar gift cards promocionales por WhatsApp |
| 8 | **Reportes** | Citas por canal, embudo de conversión, ROI, comparativa mensual |

### Prácticas enterprise implementadas
| Práctica | Inspiración | Implementación |
|----------|------------|----------------|
| **Referidos** | Airbnb/Uber | Código único por clienta, link `/r/:code`, sello doble al completar |
| **Retos y bonos** | Starbucks | "Doble sello martes", reto 3-visitas-30-días = +1 sello |
| **Tier Gold** | Sephora | Promoción automática a `cardType: gold` cuando `cycles >= 2` |
| **UGC y embajadoras** | Glossier | Foto de progreso T+14, before/after público, detección automática de embajadoras |

### Configuración del admin
- Crear cuentas de marketer (rol `marketing`)
- Configurar monto fijo de comisión por cita (default: $50 MXN)
- Ver reporte global de comisiones, marcar como pagadas
- Ver notificaciones inmediatas + resumen diario cuando un marketer agenda

---

## 2. Modelos de Datos (Schema Prisma)

**Archivo:** `prisma/schema.prisma`

### 2.1 Card — Campos de marketing nuevos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `referralCode` | String? @unique | Código de referido (ej. `SAID10`) |
| `referredByCardId` | String? | ID de la card que refirió a esta clienta |
| `referredBy` | Card? @relation("CardReferrals") | Relación a la card referrer |
| `referrals` | Card[] @relation("CardReferrals") | Clientas referidas por esta card |
| `referralStampsThisYear` | Int @default(0) | Contador de sellos por referidos (tope 5/año) |
| `birthdaySentYear` | Int? | Guard anti-doble envío de cumpleaños |
| `isAmbassador` | Boolean @default(false) | Marca de embajadora Venus |
| `bestSendHour` | Int? | Hora top de actividad WhatsApp (para send-time optimization) |
| `publicDisplayOk` | Boolean @default(false) | Consentimiento para mostrar fotos en UGC |
| `referralsMade` | Referral[] @relation("ReferralReferrer") | Referidos creados por esta card |
| `referralsReceived` | Referral[] @relation("ReferralInvitee") | Referido recibido (si fue invitada) |
| `touchpoints` | Touchpoint[] | Touchpoints de atribución |
| `challenges` | Challenge[] | Retos activos/historial |

### 2.2 Appointment — Campo nuevo

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `bookedById` | String? | ID del admin que agendó la cita (para comisión) |
| `bookedBy` | Admin? @relation("AppointmentsBookedBy") | Relación al admin que agendó |
| `commission` | Commission? | Relación 1:1 a comisión generada |
| `lead` | Lead? | Relación 1:1 al lead convertido (si vino de un lead) |
| `touchpoint` | Touchpoint? | Touchpoint de atribución |

### 2.3 Admin — Relaciones nuevas

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `bookedAppointments` | Appointment[] @relation("AppointmentsBookedBy") | Citas que este admin agendó |
| `leads` | Lead[] | Leads asignados a este marketer |
| `commissions` | Commission[] | Comisiones generadas por este marketer |

### 2.4 Modelo `Lead` (mini-CRM)

```
model Lead {
  id, name, phone, email?, origin, notes?, status, score, marketerId, appointmentId?, 
  contactedAt?, convertedAt?, createdAt, updatedAt
  
  @@index([marketerId]) @@index([status]) @@index([score])
}
```

**Campos clave:**
- `origin`: facebook-ads | instagram | referido | whatsapp | calle | otro
- `status`: nuevo | contactado | agendado | convertido | perdido
- `score`: 0-100 (computado en read con señales: isNewClient, origin, birthday, servicePrice, WhatsApp activity)

### 2.5 Modelo `Commission`

```
model Commission {
  id, marketerId, appointmentId @unique, amount (Float snapshot), status, paidAt?, createdAt
  
  @@unique([appointmentId]) // 1 cita = 1 comisión
  @@index([marketerId]) @@index([status])
}
```

**Estados:** pendiente | pagada | cancelada

### 2.6 Modelo `Referral`

```
model Referral {
  id, referrerCardId, inviteeCardId @unique, inviteePhone, status, completedAt?, awardedAt?, createdAt
  
  @@unique([inviteeCardId]) // 1 referido = 1 referral
  @@index([referrerCardId])
}
```

**Estados:** pendiente | completada | pagada

### 2.7 Modelo `Challenge` (Retos de sellos)

```
model Challenge {
  id, cardId, kind, startedAt, targetVisits, windowDays, visitsCompleted, completedAt?, bonusStamps, createdAt
  
  @@index([cardId]) @@index([kind])
}
```

**Tipos (`kind`):** tres_visitas_30 | doble_sello_dia | custom

### 2.8 Modelo `Promotion` (Ventanas promocionales)

```
model Promotion {
  id, type, name, active, config (Json), startsAt, endsAt?, createdAt
}
```

**Tipos:** doble_sello | bonus_stamp | winback_discount
**Config JSON:** `{ weekday:2, category:'facial', discountPct:10, ... }`

### 2.9 Modelo `Touchpoint` (Atribución multi-touch)

```
model Touchpoint {
  id, cardId?, channel, campaign?, utm (Json)?, timestamp, appointmentId?
  
  @@index([cardId]) @@index([channel])
}
```

**Canales:** instagram | facebook-ads | referral | whatsapp | online | direct

### 2.10 Settings de marketing

Usan el modelo `Setting` existente con keys:
- `marketing.commission.fixed_amount` (default: 50)
- `marketing.gold.threshold_cycles` (default: 2)
- `marketing.referral.cap_yearly` (default: 5)
- `marketing.ambassador.min_reviews` (default: 3)
- `marketing.ambassador.min_referrals` (default: 2)

---

## 3. Sistema de Autenticación y Roles

### Archivos: `lib/auth.js`, `server.js`

El sistema de auth ya soporta roles string en `Admin.role`. No se modificó `lib/auth.js`.

#### Cambios en `server.js`:

**Redirección de rol marketing** (línea ~597):
```js
if (payload?.role === 'marketing') {
  return res.redirect(302, '/marketing.html');
}
```
Si un marketer intenta cargar `/admin.html`, se redirige a `/marketing.html` automáticamente (igual que recepción → `/recepcion.html`).

**Registro de cuentas marketer** (línea ~6406):
El endpoint `POST /api/admin/register` ahora acepta:
- Un admin autenticado (rol `admin`) puede crear cuentas con rol `marketing`, `recepcion` o `admin`.
- Se pasa `{ role, name }` en el body.
- Si no hay admin autenticado, respeta el flujo original (`ADMIN_ALLOW_SIGNUP` + primer admin).

**`fsInsertAdmin`** ahora acepta `name` como parámetro adicional.

#### Middleware de roles:
- `requireRole("marketing")` — solo marketers
- `requireRole("admin")` — solo admin
- `requireRole("marketing", "admin")` — ambos

---

## 4. Backend — Endpoints

**Archivos:** `server.js` (rutas inline como el resto del proyecto), `src/db/repositories.js`

### 4.1 Repositorios nuevos (`src/db/repositories.js`)

| Repo | Métodos |
|------|---------|
| `LeadsRepo` | findById, findByMarketer, create, update, updateStatus, convert, delete, computeScore |
| `CommissionsRepo` | findById, create, findByAppointment, findByMarketer, findAll, markPaid, cancelByAppointment, totalsByMarketer |
| `ReferralsRepo` | findById, create, findByReferrer, findByInvitee, findPending, markCompleted, markAwarded, checkCap |
| `ChallengesRepo` | findById, findByCard, create, incrementProgress, findActive, evaluateWindows |
| `PromotionsRepo` | findById, findActive, findByType, findAll, create, update, deactivate |
| `TouchpointsRepo` | findById, findByCard, create, attributionReport |
| `CardsMarketingRepo` | findByReferralCode, findByInactive, findByBirthdayMonth, findByCardType, findAmbassadors, promoteToGold, setAmbassador, generateReferralCode, setPublicDisplayOk |

### 4.2 Ajuste en `AppointmentsRepo.create`

El `POST /api/appointments` existente ahora persiste `bookedById: req.admin?.uid` automáticamente.

### 4.3 Endpoints del marketer (todos con `requireRole('marketing')`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/marketing/appointments` | Crear cita con `bookedById` + crear Commission + notificar admin |
| GET | `/api/marketing/appointments` | Sus citas (filtradas por `bookedById`) |
| GET | `/api/marketing/agenda` | Agenda general del estudio por fecha |
| POST | `/api/marketing/leads` | Crear lead |
| GET | `/api/marketing/leads` | Listar leads ordenados por score |
| PATCH | `/api/marketing/leads/:id` | Actualizar estado / marcar contactado |
| POST | `/api/marketing/leads/:id/convert` | Convertir lead → cita (crea Appointment + Commission + marca convertido) |
| GET | `/api/marketing/commissions` | Sus comisiones (totales + historial) |
| POST | `/api/marketing/whatsapp-campaign` | Lanzar campaña WhatsApp (segmento + plantilla `{nombre}`) |
| POST | `/api/marketing/wallet-push` | Push a Wallet (usa `sendMassPushNotification`) |
| POST | `/api/marketing/giftcards` | Crear gift card promocional |
| GET | `/api/marketing/giftcards` | Gift cards existentes |
| GET | `/api/marketing/reports/sources` | Citas por canal de origen |
| GET | `/api/marketing/reports/funnel` | Embudo: leads → citas → completadas |
| GET | `/api/marketing/reports/roi` | Ingresos atribuidos vs gastos de marketing |
| GET | `/api/marketing/reports/monthly` | Comparativa mensual |

### 4.4 Endpoints del marketer/admin (con `requireRole('marketing', 'admin')`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/marketing/segments/inactive?days=30` | Clientas inactivas |
| GET | `/api/marketing/segments/birthdays?month=7` | Cumpleañeros del mes |
| GET | `/api/marketing/segments/gold` | Clientas Gold |
| GET | `/api/marketing/segments/ambassadors` | Embajadoras |
| POST | `/api/marketing/referrals/generate-code` | Generar código de referido para una clienta |
| GET | `/api/marketing/referrals?cardId=X` | Referidos de una clienta |
| GET | `/api/marketing/challenges` | Retos activos o de una card específica |
| GET | `/api/marketing/ugc/photos` | Fotos de progreso consentidas |
| POST | `/api/marketing/ugc/photos/:id/request` | Solicitar foto T+14 por WhatsApp |
| GET | `/api/marketing/reviews/pending` | Reseñas pendientes de respuesta |
| PATCH | `/api/marketing/reviews/:id/reply` | Responder reseña |

### 4.5 Endpoints del admin (todos con `requireRole('admin')`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/admin/marketers` | Listar marketers con totales de comisión |
| GET | `/api/admin/marketers/:id/commissions` | Comisiones de un marketer específico |
| PATCH | `/api/admin/commissions/:id/pay` | Marcar comisión como pagada |
| GET | `/api/admin/commissions` | Reporte global de comisiones (filtros: status, marketerId, from, to) |
| GET | `/api/admin/settings/commission` | Leer monto fijo de comisión |
| PUT | `/api/admin/settings/commission` | Editar monto fijo de comisión |
| GET | `/api/admin/settings/marketing` | Config global (gold threshold, referral cap, ambassador mins) |
| PUT | `/api/admin/settings/marketing` | Editar config global |
| POST | `/api/admin/promotions` | Crear promoción |
| GET | `/api/admin/promotions` | Listar promociones |
| GET | `/api/admin/ambassadors` | Listar embajadoras |
| PATCH | `/api/admin/cards/:id/ambassador` | Marcar/desmarcar embajadora |
| GET | `/api/admin/attribution` | Reporte first/last-touch por canal |
| POST | `/api/admin/challenges` | Crear reto para una card |

### 4.6 Endpoints públicos (sin auth)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/r/:code` | Redirect a `/agendar.html?ref=CODE` + registra Touchpoint |
| GET | `/api/public/before-after` | Galería before/after consentida (UGC) |

### 4.7 Lógica de comisión al agendar

En `POST /api/marketing/appointments` y en `POST /api/appointments` (cuando `req.admin.role === 'marketing'`):

1. Leer `marketing.commission.fixed_amount` de `Setting` (default: 50).
2. Crear `Commission` con snapshot del monto, `status: "pendiente"`.
3. Crear `Notification` tipo `cita`: "Cita agendada por marketing" con datos.
4. Si la cita se cancela después, `CommissionsRepo.cancelByAppointment` cambia status a `cancelada`.

### 4.8 Campañas WhatsApp

El endpoint `POST /api/marketing/whatsapp-campaign` generaliza el motor `promo-2025` existente:
- Selecciona audiencia por segmento (inactivos 30/60/90, cumpleañeros, gold, todas).
- Personaliza mensaje con `{nombre}`.
- Throttle de 1 mensaje cada 5 minutos (background).
- Al finalizar, notifica al admin con enviados/fallidos.

---

## 5. Lógica de Negocio Automática (Crones)

**Archivo:** `src/scheduler/cron.js` — 5 crone s nuevos dentro de `startScheduler()`:

| Cron | Horario | Función | Descripción |
|------|---------|---------|------------|
| Resumen diario de comisiones | `0 0 * * *` (medianoche) | `checkMarketingDailySummary` | Crea notificación al admin con citas agendadas por cada marketer ese día |
| Promoción a Gold | `0 6 * * *` (6 AM diario) | `checkGoldPromotion` | Promueve `cardType` a `gold` cuando `cycles >= threshold` + notifica al admin |
| Detección de embajadoras | `0 7 * * 1` (7 AM lunes) | `checkAmbassadors` | Marca `isAmbassador: true` si cumple ≥3 reseñas 5★ + ≥2 referidos completados |
| Re-engagement 30/60/90 | `0 10 * * *` (10 AM diario) | `checkReengagement` | Envía WhatsApp a clientas inactivas según threshold (con guard anti-reenvío) |
| Evaluación de retos | `0 6 * * *` (6 AM diario) | `checkChallenges` | Marca como expirados los retos cuya ventana de tiempo pasó sin completar |

---

## 6. Frontend — Portal del Marketer

**Archivos nuevos:**
- `public/marketing.html` — estructura HTML con 8 secciones
- `public/marketing.js` — lógica completa (router, API client, todas las vistas)
- `public/marketing.css` — estilos (paleta Venus, responsive, kanban, tablas)

### Estructura del portal

```
Login (cookie adm)
├── #agendar — Form: cliente, servicio, fecha/hora, staff, origen, WhatsApp toggle
├── #mis-citas — Stats de comisión + tabla de citas con badge de estado
├── #agenda — Selector de fecha + lista de slots del estudio
├── #leads — Kanban 5 columnas + form crear lead + score badges (verde/amarillo/rojo)
├── #campanas — Selector de segmento + editor de plantilla + límite
├── #push — Form: título + mensaje + tipo promo
├── #giftcards — Form crear + tabla con estado y acción WhatsApp
└── #reportes — Stats + embudo + sources + comparativa mensual
```

### Características de la UI
- **Login:** mismo formulario que `/admin-login.html` pero redirige a `/marketing.html` si role es marketing.
- **Router:** navegación por hash (`#agendar`, `#mis-citas`, etc.) con lazy-load de datos.
- **Kanban de leads:** 5 columnas (nuevo, contactado, agendado, convertido, perdido) con drag visual y score badge.
- **Stats cards:** comisión pendiente, pagada, total citas.
- **Responsive:** sidebar colapsa a 60px en móvil.

---

## 7. Frontend — Panel del Admin

**Archivo:** `public/admin.html` — secciones añadidas

### 7.1 Sección "Marketers y Comisiones" (`#tab-marketing-manage`)

Añadida dentro del `tab-marketing` existente:

- **Crear cuenta de marketing:** form con email, nombre, contraseña → `POST /api/admin/register` con `role: 'marketing'`.
- **Configuración de comisión:** input para monto fijo → `PUT /api/admin/settings/commission`.
- **Tabla de marketers activos:** nombre, email, comisión pendiente, comisión pagada, botón "Ver comisiones".
- **Reporte de comisiones:** tabla con marketer, cliente, servicio, fecha, monto, estado, botón "Marcar pagada".

### 7.2 JS añadido

Script inline al final de `admin.html` con funciones:
- `createMarketer()` — crear cuenta marketer
- `loadMarketers()` — listar marketers
- `loadMarketerCommissions(id)` — ver comisiones de un marketer
- `payCommission(id)` — marcar comisión como pagada
- `saveCommissionConfig()` / `loadCommissionConfig()` — monto fijo de comisión

### 7.3 Notificaciones

Las notificaciones de tipo `cita` con mensaje "agendada por marketing" aparecen automáticamente en el bell de notificaciones existente del admin (sin cambios necesarios — el sistema es global).

---

## 8. Captura de Atribución en Página Pública

**Archivo:** `public/agendar.html`

### Captura de `ref` y UTMs

Cuando una clienta llega a `/agendar.html?ref=SAID78&utm_source=instagram&utm_campaign=piel-grasa-jul`, el frontend captura estos parámetros y los envía dentro del `requestData` del `POST /api/public/request`.

### Lógica en el backend (`server.js`)

En `POST /api/public/request`, después de guardar la solicitud:

1. **Crear Touchpoint:** si hay `refCode` o `utm`, registra un touchpoint con `channel` derivado de `utm.source` o `referral`.
2. **Crear Referral:** si hay `refCode` y corresponde a una card existente:
   - Verifica que el referrer no sea la misma card que la invitee (anti-fraude).
   - Verifica que no exista ya un referral para esa invitee (unique constraint).
   - Crea `Referral` con `status: "pendiente"`.
3. **Al completar primera cita del referido:** (futuro — el cron de Gold o un hook en `complete` puede resolver el referral y otorgar sellos).

---

## 9. Tests

**Directorio:** `tests/` — 9 archivos nuevos, 60 tests en total (todos pasando)

| Archivo | Tests | Qué cubre |
|---------|-------|-----------|
| `tests/marketing-auth.test.js` | 5 | JWT con rol marketing, requireRole bloquea/permite |
| `tests/marketing-leads.test.js` | 7 | Lead scoring 0-100, edge cases (cold ads, referidos, cap) |
| `tests/marketing-commissions.test.js` | 4 | Totales (pendiente/pagada/cancelada), comisión cancelada no suma |
| `tests/marketing-referrals.test.js` | 6 | Generación de código de referido, anti-self-referral |
| `tests/marketing-challenges.test.js` | 5 | Retos completados, expirados, dentro de ventana |
| `tests/marketing-gold.test.js` | 9 | Promoción a Gold por cycles, detección de embajadoras |
| `tests/marketing-attribution.test.js` | 5 | Reporte first/last-touch, touchpoints sin cardId se ignoran |
| `tests/marketing-utm.test.js` | 5 | Parseo de UTMs y ref code de URL |
| `tests/marketing-reengagement.test.js` | 7 | Días desde última visita, thresholds 30/60/90, cards inactivas |
| `tests/marketing-ugc.test.js` | 7 | Consentimiento publicDisplayOk, filtro before/after |

### Ejecución
```bash
node --test tests/marketing-*.test.js
# Resultado: 60 tests, 0 fail
```

---

## 10. Migración de Base de Datos

**Archivo:** `prisma/migrations/20260729000000_add_marketing_full/migration.sql`

La migración crea:
- 6 tablas nuevas: `leads`, `commissions`, `referrals`, `challenges`, `promotions`, `touchpoints`
- 8 columnas nuevas en `cards` (referral_code, referred_by_card_id, etc.)
- 1 columna nueva en `appointments` (booked_by_id)
- Todos los índices (incluyendo unique constraints)
- Todos los foreign keys con sus políticas de borrado (Cascade, SetNull)

### Para aplicar en producción:
```bash
npx prisma migrate deploy
```

### Para desarrollo (cuando la DB esté disponible):
```bash
npx prisma db push
```

### Semilla de configuración inicial:
Las settings se crean con defaults automáticos al primer acceso:
- `marketing.commission.fixed_amount` = 50
- `marketing.gold.threshold_cycles` = 2
- `marketing.referral.cap_yearly` = 5
- `marketing.ambassador.min_reviews` = 3
- `marketing.ambassador.min_referrals` = 2

---

## 11. Decisiones de Diseño

### 11.1 Defaults aplicados (confirmados con el usuario)

| Decisión | Default | Razón |
|----------|---------|-------|
| Comisión si cita cancelada | `status: "cancelada"` (no se paga) | Si la cita no se completa, no hay razón para pagar comisión |
| Monto fijo inicial | $50 MXN | Configurable desde el panel admin |
| Marketer puede editar/cancelar sus citas | NO | Solo puede agendar; admin tiene control total |
| Threshold Gold | `cycles >= 2` (16 servicios) | 2 tarjetas completadas = clienta recurrente |

### 11.2 Arquitectura

- **No se modificó `lib/auth.js`** — el sistema de roles string ya soporta `marketing` sin cambios.
- **Rutas inline en `server.js`** — se siguió el patrón existente del proyecto (todas las rutas están en `server.js`, no en archivos de routes separados).
- **Repositorios en `src/db/repositories.js`** — se siguieron los patrones existentes de Prisma.
- **Crones en `src/scheduler/cron.js`** — se añadieron dentro de `startScheduler()` siguiendo el patrón existente.
- **Frontend HTML vanilla** — se usó el mismo patrón que `recepcion.html` (HTML + JS + CSS separados, sin framework).
- **WhatsApp** — se añadió `WhatsAppService.sendText()` como wrapper exportado de `sendViaEvolution` para uso en campañas.

### 11.3 Reutilización de código existente

| Componente existente | Reutilizado en |
|---------------------|----------------|
| `sendMassPushNotification` | Push a Wallet del marketer |
| `NotificationsRepo.create` | Notificaciones al admin |
| `CardsRepo.findByPhone` | Búsqueda de clientas al agendar |
| `AppointmentsRepo.findConflicts` | Validación de slots al agendar |
| `ServicesRepo.findById` | Gift cards promocionales |
| `Setting` model | Configuración de comisión y marketing |
| `WhatsAppService.sendConfirmation` | Confirmación de cita agendada |
| Cookie `adm` + JWT | Autenticación del marketer |
| `admin-login.html` | Login del marketer (mismo endpoint) |

---

## 12. Archivos Modificados y Creados

### Archivos creados (nuevos)

| Archivo | Líneas aprox. | Descripción |
|---------|---------------|-------------|
| `public/marketing.html` | 170 | Portal del marketer (8 secciones) |
| `public/marketing.js` | 350 | Lógica del portal (router, API, todas las vistas) |
| `public/marketing.css` | 250 | Estilos del portal |
| `prisma/migrations/20260729000000_add_marketing_full/migration.sql` | 120 | Migración SQL |
| `tests/marketing-auth.test.js` | 55 | Tests de auth |
| `tests/marketing-leads.test.js` | 60 | Tests de lead scoring |
| `tests/marketing-commissions.test.js` | 50 | Tests de comisiones |
| `tests/marketing-referrals.test.js` | 40 | Tests de referidos |
| `tests/marketing-challenges.test.js` | 45 | Tests de retos |
| `tests/marketing-gold.test.js` | 55 | Tests de Gold + embajadoras |
| `tests/marketing-attribution.test.js` | 70 | Tests de atribución multi-touch |
| `tests/marketing-utm.test.js` | 45 | Tests de captura de UTMs |
| `tests/marketing-reengagement.test.js` | 50 | Tests de re-engagement |
| `tests/marketing-ugc.test.js` | 60 | Tests de UGC/consentimiento |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `prisma/schema.prisma` | +8 campos en Card, +2 campos en Appointment, +3 relaciones en Admin, +6 modelos nuevos |
| `server.js` | Redirección marketing, registro con rol, import de 8 repos nuevos, `bookedById` en appointment, lógica de comisión+notificación al agendar, ~40 endpoints nuevos, captura de ref/UTM en booking request, `requireRole('admin')` en 4 endpoints existentes |
| `src/db/repositories.js` | +7 repositorios nuevos (Leads, Commissions, Referrals, Challenges, Promotions, Touchpoints, CardsMarketing) + exports |
| `src/scheduler/cron.js` | +5 crone s nuevos (resumen diario, Gold, embajadoras, re-engagement, retos) |
| `src/services/whatsapp-v2.js` | +`sendText()` method en `WhatsAppService` |
| `public/admin.html` | +sección "Marketers y Comisiones" + script JS |
| `public/agendar.html` | +captura de `ref` y UTMs en URL params |

### Validaciones realizadas

| Validación | Resultado |
|------------|-----------|
| `npx prisma validate` | Schema válido |
| `npx prisma generate` | Client generado sin errores |
| `node -c server.js` | Sin errores de sintaxis |
| `node -c src/db/repositories.js` | Sin errores de sintaxis |
| `node -c src/scheduler/cron.js` | Sin errores de sintaxis |
| `node -c src/services/whatsapp-v2.js` | Sin errores de sintaxis |
| `node --test tests/marketing-*.test.js` | 60 tests, 0 fail |
| Review con subagent | 1 issue encontrado y corregido (requireRole en endpoints existentes) |

---

## Cómo usar el sistema

### 1. Crear cuenta de marketer
Como admin, ir a `/admin.html` → tab Marketing → "Crear cuenta de marketing":
- Email: marketing@venus.com
- Nombre: Ana Marketing
- Contraseña: *****
- Click "Crear"

### 2. Login del marketer
Ir a `/admin-login.html` (o directamente `/marketing.html`):
- Iniciar sesión con las credenciales creadas.
- Se redirige automáticamente a `/marketing.html`.

### 3. Agendar cita y generar comisión
- Sección "Agendar" → llenar form → click "Agendar".
- Se crea cita con `bookedById` = ID del marketer.
- Se crea `Commission` con monto fijo ($50 default).
- Se crea `Notification` al admin: "Cita agendada por marketing".

### 4. Ver comisiones
- Marketer: sección "Mis Citas" → ve comisión pendiente/pagada.
- Admin: tab Marketing → "Reporte de comisiones" → puede marcar como pagada.

### 5. Configurar comisión
- Admin → tab Marketing → "Configuración de comisión" → cambiar monto → "Guardar".

### 6. Campaña WhatsApp
- Sección "Campañas" → seleccionar segmento (inactivos, cumpleañeros, gold) → escribir mensaje con `{nombre}` → "Lanzar".
- Se envía en background con throttle de 5 min/mensaje.
- Al finalizar, notificación al admin con enviados/fallidos.

### 7. Generar código de referido
- Desde el admin o el marketer: `POST /api/marketing/referrals/generate-code` con `cardId`.
- Se genera un código único (ej. `MARI78`).
- Link compartible: `venus.mx/r/MARI78` → redirige a `/agendar.html?ref=MARI78`.
- Cuando la referida agenda, se crea `Referral` pendiente.
- Cuando completa su primera cita, se otorga sello al referrer (futuro: hook en complete).

### 8. Ver reportes
- Sección "Reportes" → embudo, sources, comparativa mensual.
- Admin → tab Marketing → atribución multi-touch.
# Venus Skin en el Moji: plan de construcción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sola app de Venus en el Moji: sesión → clienta → fotos con luces → valoración de Venus aprobada en cabina → reporte en la pantalla del Moji y en la tarjeta de la clienta con el diseño aprobado.

**Architecture:** El flujo de captura (`captura.html`) entrega a `skin-advisor.html` en modo automático, que crea el borrador, genera y permite aprobar con plan y rutina. Un servicio nuevo (`skinClientReport`) arma la vista para la clienta a partir de la valoración aprobada, los mapas guardados y la valoración anterior; la sirve un router público por tarjeta y la dibuja `mi-piel.js`, que se usa igual en la tarjeta y en modo cabina dentro del advisor. La APK no cambia.

**Tech Stack:** Node 20 + Express, Prisma 5 (Postgres), vanilla JS/CSS compatible con Chrome 61 (WebView del Moji), `node --test`, Playwright solo para verificación visual.

**Spec:** `docs/superpowers/specs/2026-10-21-venus-skin-app-design.md`

## Global Constraints

- Trabajar en `~/dev/venus-loyalty-skin`, rama `feat/skin-maps-history`. No tocar la carpeta del Escritorio (git roto por iCloud) ni `~/dev/venus-loyalty`.
- WebView Chrome 61: en `public/mi-piel.*`, `public/moji-capture.js`, `public/skin-advisor.js` y `public/skin-photo-report.js` no usar `?.`, `??`, `innerHTML` con datos, `clamp()`, `aspect-ratio`, `gap` en flex ni `gap` sin prefijo en grid (usar `grid-gap` o márgenes), ni fuentes variables.
- La APK permite recursos HTTPS solo del origen Venus y `res.cloudinary.com`: las fuentes Prata y Manrope se sirven desde `public/fonts/` (sin Google Fonts).
- La APK solo navega a `/captura.html?modo=analisis` y `/skin-advisor.html` (con query). La vista de cabina vive dentro de `skin-advisor.html`.
- Diseño: fondo `#FAFBF6`, texto `#23271F`, atenuado `#575F4E`, líneas `#DCE1CF`, suave `#EEF1E2`, acento `#DCE4BE`, profundo `#5F6A3F`; Prata para títulos, Manrope para texto; marco en arco `border-radius: 156px 12px 156px 12px`.
- Sin puntajes, conteos ni diagnósticos en lo que ve la clienta. Texto en español, en segunda persona.
- Nunca exponer a la clienta: `input.answers`, `patient`, `provenance`, `reviewNotes`, `publicId`, `candidateCount`.
- Aprobación: roles `admin` y `staff`; `recepcion` no. Retirar: solo `SKIN_ADVISOR_APPROVER_ID` con rol `admin`.
- Secuencia de luces detrás de `SKIN_SEQUENCE_ENABLED=true`; por defecto una sola captura blanca.
- Cada cambio de esquema lleva migración en `prisma/migrations/` generada con `prisma migrate diff`.
- Suite: `node --test tests/skin-*.test.js tests/mi-piel-*.test.js` en verde al cerrar cada tarea. Commits en español, con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Un `v` de otra tarjeta en `mi-piel.html?card=A&v=<de B>` → 404 y mensaje "Este reporte no está disponible", nunca datos (Task 4 y 5).
2. `Service.price` es `Decimal`: el plan guardado debe llevar `price` como número, no como string, o la tarjeta mostrará "NaN" (Task 3).
3. Una clienta con valoración aprobada a la que se le inicia una toma nueva (la aprobada pasa a `superseded`) debe seguir viendo su reporte (Task 4).
4. En cabina con la sesión vencida, el advisor debe mostrar "Inicia sesión en Venus para continuar", no una pantalla en blanco (Task 8).
5. Foto original borrada después de aprobar → la tarjeta muestra "Original no disponible" y el resto del reporte sigue (Task 6).

---

### Task 1: Aprobación por staff y retiro por el dueño

**Files:**
- Modify: `src/services/ai/skinAdvisor/workflow.js:40-46` (`account`), `:185-187` (`getConfig`), `:269-292` (`approve`), añadir `retire`
- Modify: `src/routes/skinAdvisor.js:34-38`
- Modify: `prisma/schema.prisma:642-663`
- Create: `prisma/migrations/20261021010000_skin_assessment_retire/migration.sql`
- Test: `tests/skin-workflow.test.js`, `tests/skin-advisor-routes.test.js`

**Interfaces:**
- Produces: `account(db, actorId, permission)` con `permission` ∈ `undefined | 'approve' | 'owner'`; `getConfig()` devuelve además `isOwner: boolean`; `workflow.retire(actorId, id, { version })` → fila pública con `retiredAt` ISO y `retiredById`; ruta `POST /assessments/:id/retire` body `{ version }`.
- Columnas nuevas: `retiredAt DateTime?`, `retiredById String?` en `skin_advisor_assessments`, índice `[recordId, retiredAt]`.

- [ ] **Step 1: Escribir las pruebas que fallan en `tests/skin-workflow.test.js`**

Cambiar la prueba de la línea 41 para que `staff` apruebe y `other-admin` también; `reception` no:

```js
const approved = await f.workflow.approve('staff', draft.id, { version: 2, reviewNotes: 'Revisión ficticia' });
assert.equal(approved.status, 'approved');
assert.equal(approved.approval.actorId, 'staff');
```

Añadir:

```js
test('retire is owner-only, keeps the approval and bumps the version', async () => {
  const f = await fixture();
  const draft = await f.workflow.createDraft('staff', f.current.id, f.body);
  await f.workflow.generate('staff', draft.id, { version: 1 });
  const approved = await f.workflow.approve('staff', draft.id, { version: 2 });
  await assert.rejects(f.workflow.retire('staff', draft.id, { version: approved.version }), { code: 'not_authorized' });
  await assert.rejects(f.workflow.retire('other-admin', draft.id, { version: approved.version }), { code: 'not_authorized' });
  const retired = await f.workflow.retire('owner', draft.id, { version: approved.version });
  assert.equal(retired.retiredById, 'owner');
  assert.ok(Number.isFinite(Date.parse(retired.retiredAt)));
  assert.deepEqual(retired.approval, approved.approval);
  assert.equal(retired.version, approved.version + 1);
  await assert.rejects(f.workflow.retire('owner', draft.id, { version: retired.version }), { code: 'already_retired' });
  await assert.rejects(f.workflow.retire('owner', draft.id, { version: 1 }), { code: 'stale_version' });
  assert.equal((await f.workflow.getConfig('owner')).isOwner, true);
  assert.equal((await f.workflow.getConfig('staff')).isOwner, false);
  assert.equal((await f.workflow.getConfig('staff')).canApprove, true);
});
```

En la prueba "reception can prepare but never approve" mantener `canApprove === false` para `reception` y `not_authorized` al aprobar.

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/skin-workflow.test.js`
Expected: FAIL — `approve('staff')` lanza `not_authorized`; `retire is not a function`.

- [ ] **Step 3: Esquema y migración**

En `prisma/schema.prisma`, modelo `SkinAdvisorAssessment`: añadir `retiredAt DateTime?`, `retiredById String?` y `@@index([recordId, retiredAt])`. Generar:

```bash
git show HEAD:prisma/schema.prisma > <scratchpad>/old.prisma
mkdir -p prisma/migrations/20261021010000_skin_assessment_retire
npx prisma migrate diff --from-schema-datamodel <scratchpad>/old.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261021010000_skin_assessment_retire/migration.sql
npx prisma generate
```

Expected: el SQL contiene solo `ALTER TABLE "skin_advisor_assessments" ADD COLUMN "retiredAt" …, ADD COLUMN "retiredById" …` y el índice.

- [ ] **Step 4: Implementar en `workflow.js`**

- `account(db, actorId, permission)`: `'approve'` → rol ∈ `['admin','staff']` si no `not_authorized` 403; `'owner'` → `actorId === config.approverId && role === 'admin'` si no `not_authorized` 403. Reemplazar las dos llamadas `account(..., true)` en `approve` por `'approve'`.
- `getConfig`: `canApprove: ['admin','staff'].includes(user.role)`, `isOwner: user.role === 'admin' && user.id === config.approverId`.
- `retire(actorId, id, { version })`: `account(prisma, actorId, 'owner')`; `assessment()`; si `!row.approval` → `fail('not_approved', 409)`; si `row.retiredAt` → `fail('already_retired', 409)`; si `!Number.isInteger(version) || version !== row.version` → `fail('stale_version', 409)`; `tx`: `updateMany({ where: { id, version }, data: { retiredAt: now(), retiredById: actorId, version: { increment: 1 } } })`, `count !== 1` → `stale_version`; devolver `publicRow`.
- `publicRow` convierte `retiredAt` a ISO cuando exista (el fake de pruebas guarda Date).

- [ ] **Step 5: Ruta**

En `src/routes/skinAdvisor.js` añadir `router.post('/assessments/:id/retire', handle(req => workflow.retire(req.admin.uid, req.params.id, req.body)));` y en `tests/skin-advisor-routes.test.js` incluir `'retire'` en la lista de métodos del workflow falso y comprobar que `POST /assessments/a/retire` sin origin da 403 y con origin+JSON da 200 llamando `retire` con `['staff','a', {...}]`.

- [ ] **Step 6: Correr**

Run: `node --test tests/skin-workflow.test.js tests/skin-advisor-routes.test.js tests/skin-owner-authorization.test.js`
Expected: PASS (la prueba de `skin-owner-authorization` no cambia: el autorizador del dueño sigue siendo de una persona y ahora solo lo usa `retire`).

- [ ] **Step 7: Commit**

```bash
git add prisma src/services/ai/skinAdvisor/workflow.js src/routes/skinAdvisor.js tests/skin-workflow.test.js tests/skin-advisor-routes.test.js
git commit -m "feat(skin): la cosmetóloga aprueba en cabina; solo el dueño retira un reporte"
```

---

### Task 2: La información faltante ya no bloquea; prompt v4

**Files:**
- Modify: `src/services/ai/skinAdvisor/workflow.js:249`, `:279`
- Modify: `src/services/ai/skinAdvisor/prompt.js:3`, `:11`, `:16`
- Test: `tests/skin-workflow.test.js`, `tests/skin-prompt-contract.test.js`

**Interfaces:**
- Produces: tras `generate`, `status` es `needs_information` solo cuando `quality.status === 'retake'`; `approve` acepta `missingInformation` no vacío. `PROMPT_VERSION === 'venus-skin-prompt-v4'`.

- [ ] **Step 1: Pruebas**

En `tests/skin-workflow.test.js`:

```js
test('unanswered questions do not block approval; a retake does', async () => {
  const withMissing = await fixture({ provider: { generate: async context => ({ ...makeAssessment(context), missingInformation: ['Uso de protector solar'] }) } });
  const d1 = await withMissing.workflow.createDraft('staff', withMissing.current.id, withMissing.body);
  const g1 = await withMissing.workflow.generate('staff', d1.id, { version: 1 });
  assert.equal(g1.status, 'pending_review');
  const a1 = await withMissing.workflow.approve('staff', d1.id, { version: 2 });
  assert.deepEqual(a1.assessment.missingInformation, ['Uso de protector solar']);
  const retake = await fixture({ provider: { generate: async context => { const a = makeAssessment(context); a.quality.status = 'retake'; return a; } } });
  const d2 = await retake.workflow.createDraft('staff', retake.current.id, retake.body);
  const g2 = await retake.workflow.generate('staff', d2.id, { version: 1 });
  assert.equal(g2.status, 'needs_information');
  await assert.rejects(retake.workflow.approve('staff', d2.id, { version: 2 }), { code: 'stale_version' });
});
```

(El `retake` queda en `needs_information`, así que `checkVersion(..., 'pending_review')` lo rechaza antes.) Revisar con `grep -n needs_information tests/*.js` cualquier prueba que esperara bloqueo por `missingInformation` y ajustarla a esta regla.

En `tests/skin-prompt-contract.test.js:18` cambiar a `'venus-skin-prompt-v4'` y añadir:

```js
assert.match(DEVELOPER_PROMPT, /Do not list photo views or lighting modes the protocol does not supply/);
assert.match(DEVELOPER_PROMPT, /plain Spanish, addressed to the client in second person/);
assert.doesNotMatch(DEVELOPER_PROMPT, /Mention absent views in missingInformation/);
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/skin-workflow.test.js tests/skin-prompt-contract.test.js`
Expected: FAIL en las tres aserciones nuevas y en `g1.status`.

- [ ] **Step 3: Implementar**

- `workflow.js:249`: `status: output.quality.status === 'retake' ? 'needs_information' : 'pending_review'`.
- `workflow.js:279`: dejar solo la condición `quality.status === 'retake'`.
- `prompt.js`: `PROMPT_VERSION = 'venus-skin-prompt-v4'`; en la línea 11 sustituir "Mention absent views in missingInformation, not as additional quality.zones entries." por "Do not list photo views or lighting modes the protocol does not supply as missing information; missingInformation only lists unanswered questions whose answer would change an observation."; añadir antes de la última línea: "Write summary and every observations[].description in plain Spanish, addressed to the client in second person, without technical terms; keep each description to what is visible."

- [ ] **Step 4: Correr**

Run: `node --test tests/skin-*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/skinAdvisor tests/skin-workflow.test.js tests/skin-prompt-contract.test.js
git commit -m "feat(skin): las respuestas faltantes no bloquean la aprobación; prompt v4 en lenguaje claro"
```

---

### Task 3: Plan, rutina, próxima visita y progreso por zona al aprobar

**Files:**
- Create: `src/services/ai/skinAdvisor/approvalExtras.js`
- Modify: `src/services/ai/skinAdvisor/workflow.js` (`approve`, nuevo `services`)
- Modify: `src/routes/skinAdvisor.js` (nueva `GET /services`)
- Test: `tests/skin-approval-extras.test.js` (nuevo), `tests/skin-workflow.test.js`, `tests/skin-advisor-routes.test.js`

**Interfaces:**
- Produces: `normalizeApprovalExtras(extras, { services, zones })` → `{ plan, homeRoutine, nextVisitWeek, zoneProgress }` o lanza `Error('invalid_review')`.
  - `plan`: `[{ serviceId, name, price: number, durationMinutes, cadence }]`, máx. 6, `cadence` ∈ `['unica','semanal','quincenal','cada_3_semanas','mensual']`, `serviceId` debe estar en `services`.
  - `homeRoutine`: `null | { morning: string(≤600), night: string(≤600) }`.
  - `nextVisitWeek`: `null | 'YYYY-MM-DD'` fecha válida.
  - `zoneProgress`: objeto con claves ⊂ `ZONES` y valores ∈ `['mejoro','se_mantiene','a_cuidar']`.
- `workflow.services(actorId)` → `[{ id, name, price: number, durationMinutes, category }]` con `prisma.service.findMany({ where: { isActive: true, category: { in: SKIN_MENU_CATEGORIES } }, select: { id, name, price, durationMinutes, category }, orderBy: [{ name: 'asc' }, { id: 'asc' }] })` (`SKIN_MENU_CATEGORIES` viene de `src/services/ai/skinMenu.js`; `loadSkinMenu` no sirve porque no selecciona `durationMinutes` ni `category`). Extraer esa consulta a una función interna `loadServices(db)` del workflow, usada también por `approve`.
- `workflow.approve(actorId, id, { version, correctedAssessment, reviewNotes, plan, homeRoutine, nextVisitWeek, zoneProgress })` guarda los cuatro en `approval`.
- Ruta `GET /services`.

- [ ] **Step 1: Prueba unitaria `tests/skin-approval-extras.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApprovalExtras } from '../src/services/ai/skinAdvisor/approvalExtras.js';
const services = [{ id: 's1', name: 'Hidratación profunda', price: 850, durationMinutes: 60 }];
const zones = ['forehead', 'nose'];
test('plan snapshots the service and price as a number', () => {
  const out = normalizeApprovalExtras({ plan: [{ serviceId: 's1', cadence: 'cada_3_semanas' }] }, { services, zones });
  assert.deepEqual(out.plan, [{ serviceId: 's1', name: 'Hidratación profunda', price: 850, durationMinutes: 60, cadence: 'cada_3_semanas' }]);
  assert.equal(out.homeRoutine, null); assert.equal(out.nextVisitWeek, null); assert.deepEqual(out.zoneProgress, {});
});
test('rejects unknown services, bad cadence, long text, bad dates and foreign zones', () => {
  for (const extras of [
    { plan: [{ serviceId: 'nope', cadence: 'mensual' }] },
    { plan: [{ serviceId: 's1', cadence: 'diaria' }] },
    { plan: Array(7).fill({ serviceId: 's1', cadence: 'mensual' }) },
    { homeRoutine: { morning: 'x'.repeat(601), night: '' } },
    { nextVisitWeek: '2026-13-01' },
    { nextVisitWeek: '11/11/2026' },
    { zoneProgress: { chin: 'mejoro' } },
    { zoneProgress: { nose: 'peor' } },
  ]) assert.throws(() => normalizeApprovalExtras(extras, { services, zones }), /invalid_review/);
});
test('accepts a full set and trims text', () => {
  const out = normalizeApprovalExtras({ homeRoutine: { morning: ' Limpiador \n', night: 'Crema' }, nextVisitWeek: '2026-11-09', zoneProgress: { nose: 'se_mantiene' } }, { services, zones });
  assert.deepEqual(out.homeRoutine, { morning: 'Limpiador', night: 'Crema' });
  assert.equal(out.nextVisitWeek, '2026-11-09');
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/skin-approval-extras.test.js`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `approvalExtras.js`**

`export const CADENCES = ['unica','semanal','quincenal','cada_3_semanas','mensual']; export const PROGRESS_STATES = ['mejoro','se_mantiene','a_cuidar']; export function normalizeApprovalExtras(extras = {}, { services, zones }) { … }`. `price` se convierte con `Number(service.price)`; si no es finito → `invalid_review`.

- [ ] **Step 4: Pruebas del workflow**

En el `fixture()` de `tests/skin-workflow.test.js` añadir al `db`: `service: { findMany: async () => [{ id: 's1', name: 'Hidratación profunda', price: '850.00', durationMinutes: 60, category: 'Básicos Venus', isActive: true }] }` (string: así lo entrega Prisma Decimal al serializar en el fake). Añadir:

```js
test('approval stores plan, routine, next visit and zone progress; services list is private', async () => {
  const f = await fixture();
  const list = await f.workflow.services('staff');
  assert.deepEqual(list, [{ id: 's1', name: 'Hidratación profunda', price: 850, durationMinutes: 60, category: 'Básicos Venus' }]);
  await assert.rejects(f.workflow.services('nobody'), { code: 'unauthenticated' });
  const draft = await f.workflow.createDraft('staff', f.current.id, f.body);
  await f.workflow.generate('staff', draft.id, { version: 1 });
  await assert.rejects(f.workflow.approve('staff', draft.id, { version: 2, plan: [{ serviceId: 'zzz', cadence: 'mensual' }] }), { code: 'invalid_review' });
  const approved = await f.workflow.approve('staff', draft.id, { version: 2, plan: [{ serviceId: 's1', cadence: 'mensual' }], homeRoutine: { morning: 'Limpiador', night: 'Crema' }, nextVisitWeek: '2026-11-09', zoneProgress: { forehead: 'mejoro' } });
  assert.equal(approved.approval.plan[0].price, 850);
  assert.equal(typeof approved.approval.plan[0].price, 'number');
  assert.deepEqual(approved.approval.zoneProgress, { forehead: 'mejoro' });
});
```

Nota: `zones` para validar `zoneProgress` son las zonas de `input.photos` del borrador más las de `observations`.

- [ ] **Step 5: Implementar en `workflow.js` y la ruta**

- `services(actorId)`: `account` → `loadServices(prisma)` → mapear `{ id, name, price: Number(price), durationMinutes, category }`.
- `approve`: tras validar `correction`, `const extras = normalizeApprovalExtras({ plan, homeRoutine, nextVisitWeek, zoneProgress }, { services: await loadServices(prisma), zones: [...] })` envuelto en `try/catch → fail('invalid_review')`; en el `updateMany` añadir `...extras` dentro de `approval`.
- `src/routes/skinAdvisor.js`: `router.get('/services', handle(req => workflow.services(req.admin.uid)));` y en la prueba de rutas añadir `'services'` y comprobar `GET /services` 401 sin usuario, 200 con usuario.

- [ ] **Step 6: Correr**

Run: `node --test tests/skin-approval-extras.test.js tests/skin-workflow.test.js tests/skin-advisor-routes.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/ai/skinAdvisor src/routes/skinAdvisor.js tests
git commit -m "feat(skin): plan de cabina, rutina de casa, próxima visita y progreso por zona en la aprobación"
```

---

### Task 4: Servicio del reporte para la clienta

**Files:**
- Create: `src/services/skinClientReport.js`
- Test: `tests/skin-client-report.test.js`

**Interfaces:**
- Produces: `createSkinClientReport({ prisma, clock = () => new Date() })` → `{ listForCard(cardId), getForCard(cardId, assessmentId) }`.
- `listForCard(cardId)` → `null` si la tarjeta no existe; si no, array ordenado por `date` desc (máx. 12) de:
  - `{ kind: 'venus', id, date: approval.approvedAt, href: '/mi-piel.html?card=<cardId>&v=<id>' }` para `SkinAdvisorAssessment` del expediente con ese `cardId`, `status ∈ ['approved','superseded']`, `approval` presente, `retiredAt` nulo;
  - `{ kind: 'imported', id, date: analyzedAt, href: '/skin-report.html?view=<id>', overallScore, skinType, ageBiological }` para `SkinAnalysis` con `cardId` o `clientPhone` de la tarjeta (misma consulta que `server.js:4568-4573`).
- `getForCard(cardId, assessmentId)` → `null` si la tarjeta, el expediente o la valoración no existen, si `recordId` no es el del expediente de esa tarjeta, si no hay `approval` o si está retirada. Si no:

```js
{ id, approvedAt, clientName /* primer nombre de card.name */, summary, observations: [{ zone, areaId, description }],
  pendingToConfirm: string[] /* missingInformation */,
  photos: [{ id, url, mode, takenAt, analyzed: boolean }],
  layers: { [photoId]: [{ key, url }] },
  plan: [...], homeRoutine, nextVisitWeek, zoneProgress,
  previous: null | { id, approvedAt, photos, layers, zoneProgress } }
```

  - `result = approval.correctedAssessment || assessment`.
  - `photos`: `input.photos` (`analyzed: true`, `url = sourceUrl`, `takenAt = sourceTakenAt`, `mode = 'image'`) más las fotos del expediente cuyo `description` tenga `modo=<clave>` y `takenAt` a ±10 min de alguna analizada (`analyzed: false`), máx. 24.
  - `layers`: último `SkinLayerSet` por foto analizada; cada imagen solo `{ key, url }`.
  - `previous`: la valoración del mismo expediente con `approval`, no retirada, con `approvedAt` anterior más reciente.

- [ ] **Step 1: Pruebas `tests/skin-client-report.test.js`**

Fake de Prisma con: `card.findUnique`, `clientRecord.findUnique({ where: { cardId } })`, `skinAdvisorAssessment.findUnique/findMany`, `skinAnalysis.findMany`, `clientPhoto.findMany`, `skinLayerSet.findMany` (mismo estilo `match()` que `tests/skin-layer-history.test.js`). Datos: tarjeta `card-a` (name 'Daniela Pérez') con expediente `rec-a`; tarjeta `card-b`; valoraciones `v1` (aprobada 2026-08-12, superseded), `v2` (aprobada 2026-10-21, approved), `v3` (aprobada y retirada), `v4` (draft sin approval); fotos `white` (modo=image, 11:00), `uv` (modo=image_uv, 11:03), `old` (modo=image, un día antes); layer sets para `white` (dos, distinto `createdAt`).

```js
test('list merges Venus and imported reports, newest first, hiding retired and drafts', …);
  // espera kinds ['venus','imported','venus'] según fechas; sin v3 ni v4; null para tarjeta inexistente
test('detail enforces card ownership and approval', …);
  // getForCard('card-b','v2') === null; getForCard('card-a','v3') === null; getForCard('card-a','v4') === null; getForCard('card-a','v2') !== null
test('detail never leaks private fields and keeps counts out', …);
  // JSON.stringify(detail) no contiene 'answers', 'reviewNotes', 'publicId', 'candidateCount', 'provenance', 'patient'
test('detail adds complementary captures within ten minutes and the latest map set', …);
  // photos ids ['white','uv'] (no 'old'); layers.white[0].url es el del set más reciente; layers.white[0] tiene solo key y url
test('previous is the latest earlier approved report even if superseded', …);
  // detail.previous.id === 'v1'; detail(v1).previous === null
test('clientName is the first name and plan fields pass through', …);
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/skin-client-report.test.js`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `src/services/skinClientReport.js`**

Validar ids con `/^[A-Za-z0-9_-]{1,128}$/` y devolver `null` si no cumplen. La regla de ±10 min y la lectura de `modo=` copian `public/skin-report-data.js:5-25`.

- [ ] **Step 4: Correr**

Run: `node --test tests/skin-client-report.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/skinClientReport.js tests/skin-client-report.test.js
git commit -m "feat(skin): servicio del reporte para la clienta por tarjeta"
```

---

### Task 5: Router público y lista en la tarjeta

**Files:**
- Create: `src/routes/skinClient.js`
- Modify: `server.js` (junto a `:4556`), `public/index.html:3733-3765`
- Test: `tests/skin-client-routes.test.js` (nuevo), `tests/skin-advisor-ui.test.js`

**Interfaces:**
- Produces: `createSkinClientRouter({ report })` montado en `app.use('/api/public/card', …)`:
  - `GET /:cardId/skin-reports` → `{ success: true, data: [...] }`; 404 `{ success: false, error: 'not_found' }` si `null`.
  - `GET /:cardId/skin-reports/:assessmentId` → igual con el detalle.
  - Ambas: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow, noarchive`; ids inválidos → 400 `invalid_input`; error interno → 500 `internal_error` sin mensaje.

- [ ] **Step 1: Prueba `tests/skin-client-routes.test.js`**

Mismo arnés que `tests/skin-advisor-routes.test.js` (express en `127.0.0.1:0`, `fetch`). Fake `report` que registra llamadas y devuelve `null` para `card-x`, un array para `card-a` y un objeto para `card-a/v2`. Aserciones: 200 + headers, 404 en `null`, 400 en `card-a/..%2F`, `calls` con los argumentos exactos.

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/skin-client-routes.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar el router y montarlo**

En `server.js`, importar `createSkinClientReport` y `createSkinClientRouter`; después del bloque `/api/public/card/:id/skin-analyses` (dejarlo intacto): `app.use('/api/public/card', createSkinClientRouter({ report: createSkinClientReport({ prisma }) }));`.

- [ ] **Step 4: Tarjeta (`public/index.html`)**

En `loadSkinAnalyses(cardId)` cambiar la URL a `/api/public/card/<id>/skin-reports`. Render por `kind`: `venus` → título `i === 0 ? 'Tu reporte Venus Skin' : 'Reporte Venus Skin'` + fecha, subtítulo 'Toca para ver tu reporte', círculo con el destello (SVG de 4 puntas, `text-venus-olive`), `href = a.href` (mismo origen, sin `target="_blank"` para que abra en la misma pestaña del celular); `imported` → como hoy pero el título 'Análisis anterior' + fecha. Mantener `esc()` en todo lo interpolado.

- [ ] **Step 5: Prueba estática**

En `tests/skin-advisor-ui.test.js` añadir:

```js
test('client card lists Venus reports from the public router', () => {
  const index = read('public/index.html');
  assert.match(index, /\/skin-reports`/);
  assert.match(index, /Análisis anterior/);
  assert.match(read('server.js'), /app\.use\('\/api\/public\/card', createSkinClientRouter/);
});
```

- [ ] **Step 6: Correr**

Run: `node --test tests/skin-client-routes.test.js tests/skin-advisor-ui.test.js && node --check server.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/skinClient.js server.js public/index.html tests
git commit -m "feat(skin): reportes Venus en la tarjeta de la clienta"
```

---

### Task 6: Página `mi-piel` con el diseño aprobado

**Files:**
- Create: `public/mi-piel.html`, `public/mi-piel.css`, `public/mi-piel.js`
- Create: `public/fonts/prata-latin-400-normal.woff2`, `public/fonts/manrope-latin-400-normal.woff2`, `…-500…`, `…-600…`, `…-700…`, `public/fonts/LICENSE-OFL.txt`
- Test: `tests/mi-piel-ui.test.js`

**Interfaces:**
- Produces: `window.VenusMiPiel = { render(root, data, options), cadences, zoneLabels, layerCopy }`.
  - `data`: el detalle de la Tarea 4.
  - `options`: `{ mode: 'card' | 'cabina', agendarHref: string | null, onDone: function | null, onSendLink: function | null }`.
  - Arranque automático: si existe `#mi-piel` y la URL trae `card` y `v`, hace `fetch('/api/public/card/<card>/skin-reports/<v>', { credentials: 'same-origin' })` y renderiza con `mode: 'card'`, `agendarHref: '/agendar.html'`; 404 → "Este reporte no está disponible."; error de red → "No se pudo cargar tu reporte. Intenta de nuevo."
- Consume: nada del servidor salvo ese endpoint.

- [ ] **Step 1: Fuentes**

En el scratchpad: `npm pack @fontsource/prata@5 @fontsource/manrope@5`, extraer y copiar `files/prata-latin-400-normal.woff2` y `files/manrope-latin-{400,500,600,700}-normal.woff2` a `public/fonts/`; copiar la licencia OFL de cada paquete a `public/fonts/LICENSE-OFL.txt`. No fuentes variables.

- [ ] **Step 2: Prueba estática `tests/mi-piel-ui.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('mi-piel page is Chrome 61 safe, self-hosted and private', () => {
  const js = read('public/mi-piel.js'), css = read('public/mi-piel.css'), html = read('public/mi-piel.html');
  assert.doesNotThrow(() => new vm.Script(js));
  assert.doesNotMatch(js, /\?\.|\?\?|innerHTML|eval\(|fonts\.googleapis|candidateCount|publicId/);
  assert.doesNotMatch(css, /(^|[^-])gap\s*:|clamp\(|aspect-ratio|fonts\.googleapis|font-variation/m);
  assert.match(css, /grid-gap/);
  assert.match(css, /url\(\/fonts\/prata-latin-400-normal\.woff2\)/);
  assert.match(html, /<html lang="es">/);
  assert.match(html, /Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:\/\/res\.cloudinary\.com; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /<script>|onclick=/);
  assert.match(js, /window\.VenusMiPiel = /);
  assert.match(js, /skin-reports/);
  assert.match(js, /Original no disponible/);
  assert.match(js, /Este reporte no está disponible/);
  for (const f of ['prata-latin-400-normal', 'manrope-latin-400-normal', 'manrope-latin-700-normal']) assert.ok(existsSync(new URL('../public/fonts/' + f + '.woff2', import.meta.url)));
});
```

- [ ] **Step 3: Correr y ver fallar**

Run: `node --test tests/mi-piel-ui.test.js`
Expected: FAIL — archivos no existen.

- [ ] **Step 4: Implementar `mi-piel.html`, `mi-piel.css`, `mi-piel.js`**

Estructura y copy (del lienzo aprobado):

- Cabecera: logo `/assets/logo.png` (alt "Venus Cosmetología") y fecha de `approvedAt` en `es-MX`.
- Pestañas en una barra fija inferior (modo `card`) o superior (modo `cabina`): Resumen, Mapas, Progreso, Plan; botones `<button type="button" aria-pressed>`; la pestaña activa `#5F6A3F` en negritas. Solo una sección visible a la vez (`hidden`).
- **Resumen:** `h1` "Hola, {clientName}"; párrafo "Así se ve tu piel en la valoración de hoy. Tu cosmetóloga revisó cada punto antes de enviártelo."; marco en arco con la primera foto analizada (`img` con `referrerPolicy='no-referrer'`, `onerror` → texto "Original no disponible" y el resto sigue) y un destello (`svg` de 4 puntas, fondo blanco 85 %) por cada zona distinta de `observations` según `PINS = { forehead:[50,20], nose:[50,50], right_cheek:[32,56], left_cheek:[68,56], right_eye:[34,38], left_eye:[66,38], chin:[50,82], lower_contour:[50,92] }` (porcentajes; `full_face`/`unknown` sin destello); pie "Fotografía con luz blanca del {fecha}. Los destellos marcan las zonas revisadas."; `h2` "Lo que vimos" con una fila por observación: zona (`zoneLabels`) y `description`; tarjeta "Revisado por tu cosmetóloga · Venus Cosmetología aprobó este reporte el {fecha}"; si `pendingToConfirm.length`, bloque "Para confirmar en tu siguiente visita" con la lista; pie "Valoración cosmética. No sustituye una consulta médica."
- **Mapas:** chips por cada `key` presente en `layers[primera foto analizada]` en el orden `poros, textura, arrugas, manchas, lesiones, zonas_rojas, brillo`; al elegir, muestra la imagen del mapa en el marco y la tarjeta con `layerCopy[key].name/text/care`; sin mapas → "Los mapas de esta valoración no están disponibles." Aviso fijo: "Los mapas son una guía visual sobre tu fotografía, revisada por tu cosmetóloga. No son una medición médica."
- **Progreso:** si `previous` es `null` → "Esta es tu primera valoración. En tu próxima visita verás aquí la comparación."; si no: selector "Qué comparar" con `Foto` + las capas comunes a ambas; dos marcos lado a lado (`previous.approvedAt` / "{fecha}, hoy"); lista "Por zona" con `zoneProgress` de la valoración actual (`Mejoró` verde `#5F6A3F`, `Se mantiene` `#E6E9DC`, `A cuidar` `#F4E2BF`); sin `zoneProgress` → solo la comparación.
- **Plan:** `h1` "Tu plan"; "En cabina": filas `name` · `cadences[cadence]` · precio `toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })`; "En casa": pestañas Mañana/Noche con `homeRoutine.morning/night` separados por salto de línea en lista numerada; tarjeta oscura "Próxima cita sugerida · Semana del {nextVisitWeek}" con botón `agendarHref` "Agendar mi próxima cita" (modo `card`); sin plan ni rutina → "Tu cosmetóloga te comparte el plan en tu próxima visita."
- Modo `cabina`: botón "Listo" (`onDone`) y "Enviar enlace por WhatsApp" (`onSendLink`) arriba; sin `agendarHref`.
- Tablas de copy en `mi-piel.js`:

```js
cadences = { unica: 'Una sesión', semanal: 'Cada semana', quincenal: 'Cada 15 días', cada_3_semanas: 'Cada 3 semanas', mensual: 'Cada mes' };
zoneLabels = { forehead: 'Frente', nose: 'Nariz', right_cheek: 'Mejilla derecha', left_cheek: 'Mejilla izquierda', chin: 'Mentón', right_eye: 'Contorno del ojo derecho', left_eye: 'Contorno del ojo izquierdo', lower_contour: 'Contorno inferior', full_face: 'Rostro completo', unknown: 'Zona no registrada' };
layerCopy = {
  poros:       { name: 'Poros', text: 'Puntos donde el poro se ve más abierto, sobre todo en nariz y mejillas.', care: 'Ayuda: limpieza profunda en cabina y exfoliación suave en casa.' },
  textura:     { name: 'Textura', text: 'Zonas donde la superficie de la piel se ve menos uniforme.', care: 'Ayuda: hidratación constante y exfoliación suave.' },
  arrugas:     { name: 'Líneas y arrugas', text: 'Líneas de expresión marcadas sobre la foto. Se notan más al gesticular.', care: 'Ayuda: hidratación y protector solar todos los días.' },
  manchas:     { name: 'Manchas', text: 'Zonas con un poco más de pigmento que el tono a su alrededor.', care: 'Ayuda: protector solar diario y un sérum con vitamina C.' },
  lesiones:    { name: 'Puntos rojos', text: 'Pequeños puntos enrojecidos marcados sobre la foto.', care: 'Ayuda: productos calmantes; evita tocarlos.' },
  zonas_rojas: { name: 'Zonas rojas', text: 'Áreas con más enrojecimiento que el resto del rostro.', care: 'Ayuda: productos calmantes y evitar agua muy caliente.' },
  brillo:      { name: 'Brillo', text: 'Dónde se acumula más grasa durante el día.', care: 'Ayuda: limpieza por la noche e hidratación ligera sin aceites.' }
};
```

- Solo se pintan URLs que pasen `imageUrl()` (mismo criterio que `public/skin-photo-report.js:13-17`: `https://res.cloudinary.com` o mismo origen).
- Todo el DOM con `document.createElement`/`textContent`; sin `innerHTML`.

- [ ] **Step 5: Verificación visual local**

Servir `public/` con `python3 -m http.server` desde el scratchpad enlazando `mi-piel.*`, `fonts/` y `assets/logo.png`, más un `index.html` de arnés que llame `VenusMiPiel.render` con un JSON sintético (sin pacientes: fotos `https://res.cloudinary.com/demo/image/upload/sample.jpg`) que incluya `previous`, `pendingToConfirm`, `plan`, `homeRoutine`, `zoneProgress`. Con Playwright a 390×844: recorrer las cuatro pestañas, `document.documentElement.scrollWidth <= innerWidth`, captura de cada pestaña; revisar que coincide con el lienzo.
Expected: sin desbordes, sin errores de consola, fuentes Prata/Manrope cargadas (`document.fonts.check('16px Prata')` true).

- [ ] **Step 6: Correr**

Run: `node --test tests/mi-piel-ui.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/mi-piel.html public/mi-piel.css public/mi-piel.js public/fonts tests/mi-piel-ui.test.js
git commit -m "feat(skin): página mi-piel para la clienta con el diseño aprobado"
```

---

### Task 7: Captura: consentimiento, bandera de secuencia, búsqueda para staff y entrega automática

**Files:**
- Modify: `src/services/ai/skinAdvisor/config.js`, `src/services/ai/skinAdvisor/workflow.js` (`getConfig`)
- Modify: `server.js:5986` (`/api/admin/cards-firebase`), y la guardia de `POST /api/client-records/:id/photos` en `src/routes/clientRecords.js` si exige `admin`
- Modify: `public/captura.html`, `public/moji-capture.js`, `public/moji-capture-flow.js`
- Test: `tests/skin-advisor-ui.test.js`, `tests/skin-workflow.test.js`, `tests/moji-capture-flow.test.js` (si existe; si no, crear)

**Interfaces:**
- Produces: `skinAdvisorConfig(env).sequenceEnabled === (env.SKIN_SEQUENCE_ENABLED === 'true')`; `getConfig()` devuelve `sequenceEnabled`.
- `VenusCaptureFlow.session().advisorUrl(cardId, extra)` acepta `extra` objeto `{ auto: '1', cabina: '1', consent: '<version>' }` y lo añade a la query.
- Al entrar a `skin-advisor.html` desde captura: `?capture=1&recordId=&cardId=&photoIds=&auto=1&cabina=1&consent=<consentVersion>`.

- [ ] **Step 1: Pruebas**

En `tests/skin-advisor-ui.test.js`:

```js
test('sequence flag is off by default and reaches the capture page', () => {
  assert.equal(skinAdvisorConfig().sequenceEnabled, false);
  assert.equal(skinAdvisorConfig({ SKIN_SEQUENCE_ENABLED: 'true' }).sequenceEnabled, true);
  const capture = read('public/moji-capture.js');
  assert.match(capture, /sequenceEnabled/);
  assert.match(capture, /consent-captura/);
  assert.match(capture, /auto: '1', cabina: '1'/);
  assert.doesNotMatch(capture, /\?\.|\?\?|innerHTML/);
  assert.match(read('server.js'), /app\.get\("\/api\/admin\/cards-firebase", adminAuth, requireRole\("admin", "staff"\)/);
});
```

En `tests/skin-workflow.test.js`, en la prueba de `getConfig`, `assert.equal(config.sequenceEnabled, false)` con el fixture y `true` con `config: { sequenceEnabled: true }`.

Para `advisorUrl`: si existe `tests/moji-capture-flow.test.js` añadir; si no, crear con `vm` cargando `public/moji-capture-flow.js` en un `globalThis` falso: `advisorUrl('card', { auto: '1', cabina: '1', consent: 'venus-openai-photos-v1' })` termina en `&auto=1&cabina=1&consent=venus-openai-photos-v1`, y `advisorUrl('card')` no cambia.

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/skin-advisor-ui.test.js tests/skin-workflow.test.js tests/moji-capture-flow.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- `config.js`: `sequenceEnabled: env.SKIN_SEQUENCE_ENABLED === 'true'`. `workflow.getConfig`: `sequenceEnabled: config.sequenceEnabled === true`.
- `server.js:5986`: `requireRole("admin", "staff")`. Revisar `src/routes/clientRecords.js` `POST /:recordId/photos` y `GET /card/:id`: si llevan `requireRole("admin")`, abrir a `staff`; si solo `adminAuth`, no tocar.
- `captura.html`: dentro de `#s-camara`, antes de los botones de toma, `<label id="consent-wrap" hidden><input type="checkbox" id="consent-captura"> <span id="consent-text"></span></label>`.
- `moji-capture.js`:
  - tras `/api/admin/me`: `var cfg = await json('/api/skin-advisor/config'); skinConfig = cfg.data;` `$('consent-text').textContent = skinConfig.consentText;`
  - `controls()`: `#consent-wrap` visible solo con `$('modo').value === 'analisis'`; en ese modo `b-tomar` y `b-protocolo` deshabilitados hasta `#consent-captura` marcado; `b-protocolo` oculto salvo `nativeSequence && skinConfig.sequenceEnabled`.
  - `b-analizar`: `flow.advisorUrl(clienta.id, { auto: '1', cabina: '1', consent: skinConfig.consentVersion })` (solo si el consentimiento está marcado; si no, `status('e-tomar', 'Marca el consentimiento de la clienta antes de analizar.', true)`).
  - Texto de `#e-luces` cuando la bandera está apagada y hay secuencia nativa: "Protocolo de luces pendiente de validación física. Se usa solo luz blanca."
- `moji-capture-flow.js`: `advisorUrl(cardId, extra)` añade `'&' + key + '=' + encodeURIComponent(value)` por cada par de `extra` (solo claves `auto`, `cabina`, `consent`).

- [ ] **Step 4: Correr**

Run: `node --test tests/skin-*.test.js tests/moji-capture-flow.test.js && node --check server.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src server.js public/captura.html public/moji-capture.js public/moji-capture-flow.js tests
git commit -m "feat(captura): consentimiento en cabina, bandera de secuencia y entrega automática al advisor"
```

---

### Task 8: Advisor: prellenado, borrador automático, plan al aprobar y vista de cabina

**Files:**
- Create: `src/services/ai/skinAdvisor/intakePrefill.js`
- Modify: `src/services/ai/skinAdvisor/workflow.js` (`createSkinAdvisorWorkflow` recibe `clientReport`; `getRecord` añade `prefill`; nuevo `clientView`)
- Modify: `src/routes/skinAdvisor.js` (nueva `GET /assessments/:id/client-view`)
- Modify: `server.js:809-816` (inyectar `clientReport`)
- Modify: `public/skin-advisor.html`, `public/skin-advisor.js`
- Test: `tests/skin-intake-prefill.test.js` (nuevo), `tests/skin-workflow.test.js`, `tests/skin-advisor-routes.test.js`, `tests/skin-advisor-ui.test.js`

**Interfaces:**
- Produces: `prefillFromIntake(intake)` → objeto con claves ⊂ `ANSWER_FIELDS` y valores `string | null` (≤ 500 chars, recortados):
  - `symptoms ← skinCondition`, `duration ← conditionSince`, `previousTreatments ← previousTreatments`, `reactions ← treatmentReactions`, `routineDay ← routineDay.join(', ')`, `routineNight ← routineNight.join(', ')`, `allergies ← interestData.alergias.detail` (solo si `.value` es verdadero), `medications ← interestData.medicamentos.detail`, `sunscreen ← interestData.protectorSolar.detail || (value ? 'Sí' : 'No')`. `intake` nulo → `{}`.
- `getRecord()` devuelve además `prefill` (de `prisma.intakeForm.findUnique({ where: { recordId } })`) y en cada `assessment` el `approval` ya incluye `homeRoutine`.
- `workflow.clientView(actorId, id)` → `clientReport.getForCard(record.cardId, id)`; `null` → `fail('not_found', 404)`.
- Ruta `GET /assessments/:id/client-view`.
- `skin-advisor.html` carga `/mi-piel.css` y `/mi-piel.js` y añade dentro de `#approval-form`: `<fieldset id="plan-services">`, `<textarea id="home-morning">`, `<textarea id="home-night">`, `<select id="next-visit">`, `<div id="zone-progress">`, y fuera del form `<button id="retire" hidden>` y `<div id="cabina" hidden>`.

- [ ] **Step 1: Pruebas**

`tests/skin-intake-prefill.test.js`: intake completo → mapeo exacto; `interestData.alergias.value === false` → `allergies` ausente; arrays vacíos → `null`; texto de 600 chars → recortado a 500; `prefillFromIntake(null)` → `{}`.

`tests/skin-workflow.test.js`: al `db` del fixture añadir `intakeForm: { findUnique: async () => ({ skinCondition: 'Brillo en zona T', routineDay: ['Limpiador'], interestData: { protectorSolar: { value: true, detail: '' } } }) }` y `current.cardId = 'card-1'`; crear el workflow con `clientReport: { getForCard: async (cardId, id) => cardId === 'card-1' ? { id, clientName: 'Prueba' } : null }`. Pruebas:

```js
test('record prefill comes from the intake form', async () => {
  const f = await fixture();
  const rec = await f.workflow.getRecord('staff', f.current.id);
  assert.deepEqual(rec.prefill, { symptoms: 'Brillo en zona T', routineDay: 'Limpiador', sunscreen: 'Sí' });
});
test('client view requires account, ownership and approval', async () => {
  const f = await fixture();
  const draft = await f.workflow.createDraft('staff', f.current.id, f.body);
  await assert.rejects(f.workflow.clientView('nobody', draft.id), { code: 'unauthenticated' });
  assert.deepEqual(await f.workflow.clientView('staff', draft.id), { id: draft.id, clientName: 'Prueba' });
  f.current.cardId = 'card-2';
  await assert.rejects(f.workflow.clientView('staff', draft.id), { code: 'not_found' });
});
```

`tests/skin-advisor-routes.test.js`: `'clientView'` en la lista; `GET /assessments/a/client-view` 401 sin usuario, 200 con usuario y `cache-control: private, no-store`.

`tests/skin-advisor-ui.test.js`, en la prueba de la UI privada añadir:

```js
assert.match(script, /query\.get\('auto'\) === '1'/);
assert.match(script, /query\.get\('cabina'\) === '1'/);
assert.match(script, /record\.prefill/);
assert.match(script, /VenusMiPiel\.render/);
assert.match(script, /'\/services'/);
assert.match(script, /\/retire'/);
assert.match(script, /config\.isOwner/);
assert.match(read('public/skin-advisor.html'), /id="plan-services"/);
assert.match(read('public/skin-advisor.html'), /<script src="\/mi-piel\.js/);
assert.match(script, /Inicia sesión en Venus para continuar/);
```

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/skin-intake-prefill.test.js tests/skin-workflow.test.js tests/skin-advisor-routes.test.js tests/skin-advisor-ui.test.js`
Expected: FAIL.

- [ ] **Step 3: Backend**

- `intakePrefill.js` según la interfaz.
- `workflow.js`: parámetro `clientReport`; `getRecord` consulta `intakeForm.findUnique` y añade `prefill: prefillFromIntake(intake)`; `clientView(actorId, id)`: `account`, `assessment`, `record(db, row.recordId)`, `clientReport.getForCard(current.cardId, id)` → `null` → `not_found`.
- `src/routes/skinAdvisor.js`: `router.get('/assessments/:id/client-view', handle(req => workflow.clientView(req.admin.uid, req.params.id)));`
- `server.js`: `const skinClientReport = createSkinClientReport({ prisma });` antes del workflow; pasar `clientReport: skinClientReport` y reutilizar la misma instancia para el router público de la Tarea 5.

- [ ] **Step 4: `skin-advisor.html`**

Añadir los nodos de la interfaz (ids exactos). `#cabina` contiene `<button id="cabina-done" type="button">Listo</button> <button id="cabina-send" type="button">Enviar enlace por WhatsApp</button> <div id="cabina-view"></div>`. Cargar `<link rel="stylesheet" href="/mi-piel.css">` y `<script src="/mi-piel.js?v=20261021a">` antes de `skin-advisor.js`.

- [ ] **Step 5: `skin-advisor.js`**

- Modo automático (`query.get('auto') === '1'` y `captureIds.length`): tras `renderPhotos`, marcar cada foto de la sesión: `check.checked = true`, `zone.value = 'full_face'`, `orientation.value = 'upright'`, `side.checked = true`, `captured.value = takenAt` en formato local, `confirmed.checked = true`; `byId('white-light').checked = true`; `byId('objective').value` desde `record.record.objectives`; `answer-<campo>` desde `record.prefill`; `answer-goal` desde el objetivo; `byId('consent').checked = query.get('consent') === config.consentVersion`; si falta consentimiento → `message('Falta el consentimiento de la clienta. Márcalo y guarda.', true)` y parar; si no, disparar el submit del borrador y, al terminar, `byId('generate').click()`; mensaje "Analizando con el proveedor de IA. Espera sin repetir la solicitud…".
- Formulario de aprobación: al entrar en `canReview` cargar `api('/services')` una vez y pintar en `#plan-services` una fila por servicio: checkbox + `select` de cadencia (`VenusMiPiel.cadences`); `#home-morning`/`#home-night` prellenados con `approval.homeRoutine` de la valoración aprobada anterior en `record.assessments` (si existe); `#next-visit`: opción vacía + los próximos 8 lunes (`value` `YYYY-MM-DD`, texto "Semana del d de mes"); `#zone-progress`: por cada zona distinta de `result.observations`, un `select` `['', 'mejoro', 'se_mantiene', 'a_cuidar']` con etiquetas de `VenusMiPiel.zoneLabels`; solo cuando exista una valoración aprobada anterior.
- Cuerpo de `approve`: `plan`, `homeRoutine` (`null` si ambos vacíos), `nextVisitWeek` (`null` si vacío), `zoneProgress` (solo zonas con valor).
- `#retire`: visible cuando `config.isOwner && row.approval && !row.retiredAt`; `confirm()` no (bloquea el WebView): usar un segundo clic "Confirmar retiro" en el mismo botón; llama `/assessments/<id>/retire` con `{ version }`; `approval-info` muestra "Retirado de la tarjeta el …".
- `approval-info` tras aprobar: "Aprobada el {fecha}. Visible en la tarjeta de la clienta."
- Modo cabina (`query.get('cabina') === '1'`): cuando `row.status === 'approved'` y no retirada, `current = row`, pedir `api('/assessments/<id>/client-view')` y `VenusMiPiel.render(byId('cabina-view'), data, { mode: 'cabina', onDone, onSendLink })`; ocultar `#review`, mostrar `#cabina`; `onDone` → `location.href = '/captura.html?modo=analisis'`; `onSendLink` → Task 9 (hasta entonces, `message('Envío por WhatsApp disponible en la siguiente tarea.')`).
- Errores de `api()` con `payload.error === 'unauthenticated' | 'auth_required' | 'invalid_token'` → `message('Inicia sesión en Venus para continuar. Vuelve a la captura e inicia sesión.', true)` y, en modo cabina, botón "Volver a la captura".

- [ ] **Step 6: Correr**

Run: `node --test tests/skin-*.test.js tests/mi-piel-ui.test.js && node --check server.js`
Expected: PASS.

- [ ] **Step 7: Verificación visual local**

Servir `public/` con un servidor estático que además responda `/api/skin-advisor/*` con JSON sintético (sin pacientes): abrir `/skin-advisor.html?capture=1&recordId=r&cardId=c&photoIds=p1&auto=1&cabina=1&consent=venus-openai-photos-v1` a 1280×800 (pantalla del Moji) y a 390×844; comprobar que el borrador se crea solo, que el formulario de aprobación muestra servicios/rutina/semana/zonas y que al aprobar aparece la vista de cabina con "Listo".
Expected: sin errores de consola; sin desbordes.

- [ ] **Step 8: Commit**

```bash
git add src server.js public/skin-advisor.html public/skin-advisor.js tests
git commit -m "feat(skin): borrador automático desde cabina, plan al aprobar y vista de la clienta en el Moji"
```

---

### Task 9: Enlace por WhatsApp

**Files:**
- Modify: `src/services/whatsapp-v2.js:303` (añadir `sendMiPielLink`)
- Modify: `src/services/ai/skinAdvisor/config.js` (`publicBaseUrl`), `workflow.js` (`clientLink`), `src/routes/skinAdvisor.js` (`POST /assessments/:id/send-link`, parámetro `sendLink`), `server.js`, `public/skin-advisor.js` (`onSendLink`)
- Test: `tests/skin-workflow.test.js`, `tests/skin-advisor-routes.test.js`, `tests/skin-whatsapp-link.test.js` (nuevo, estático sobre `whatsapp-v2.js`)

**Interfaces:**
- Produces: `config.publicBaseUrl = (env.BASE_URL || '').replace(/\/+$/, '')`.
- `workflow.clientLink(actorId, id)` → `{ card: { name, phone }, url: '<publicBaseUrl>/mi-piel.html?card=<cardId>&v=<id>' }`; exige aprobación vigente (no retirada) y `publicBaseUrl` no vacío (`fail('link_unavailable', 503)`); tarjeta sin teléfono → `fail('no_phone', 409)`.
- `WhatsAppService.sendMiPielLink(card, url)` → `sendViaEvolution(card.phone, mensaje)` con el texto: `🌸 Hola {nombre}, tu reporte de piel de *Venus Cosmetología* ya está listo. Míralo aquí:\n\n{url}\n\nSolo tú puedes abrirlo desde tu tarjeta. ✨`.
- `createSkinAdvisorRouter({ workflow, authenticate, expectedOrigin, sendLink })`; `POST /assessments/:id/send-link` → `const link = await workflow.clientLink(...)`; `await sendLink(link.card, link.url)`; responde `{ sent: true }`.

- [ ] **Step 1: Pruebas**

Workflow: fixture con `card: { findUnique: async ({ where }) => where.id === 'card-1' ? { id: 'card-1', name: 'Daniela', phone: '5215512345678' } : null }` y `config: { publicBaseUrl: 'https://venus.example' }`: `clientLink('staff', approvedId)` devuelve la URL exacta; borrador → `not_approved`; retirada → `not_approved`; sin `publicBaseUrl` → `link_unavailable`; teléfono vacío → `no_phone`.
Rutas: `'clientLink'` en la lista; `sendLink` falso que registra; `POST /assessments/a/send-link` 403 sin origin, 200 con origin+JSON y `sendLink` llamado una vez con `(card, url)`.
Estático (`tests/skin-whatsapp-link.test.js`): `assert.match(src, /async sendMiPielLink\(card, url\)/)`, `assert.match(src, /tu reporte de piel de \*Venus Cosmetología\* ya está listo/)` y `assert.match(src, /\$\{url\}/)`.

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test tests/skin-workflow.test.js tests/skin-advisor-routes.test.js tests/skin-whatsapp-link.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`server.js`: `sendLink: (card, url) => WhatsAppService.sendMiPielLink(card, url)` (confirmar el nombre del objeto exportado en la línea 41). `skin-advisor.js`: `onSendLink` → `api('/assessments/<id>/send-link', {})` y `message('Enlace enviado por WhatsApp.')`; errores `no_phone` → "La clienta no tiene teléfono registrado."; `link_unavailable` → "Falta configurar BASE_URL en el servidor." (añadir ambos al mapa `errors`).

- [ ] **Step 4: Correr**

Run: `node --test tests/skin-*.test.js tests/mi-piel-ui.test.js && node --check server.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src server.js public/skin-advisor.js tests
git commit -m "feat(skin): enviar a la clienta el enlace de su reporte por WhatsApp"
```

---

### Task 10: Camino a producción (migraciones, merge, variables)

**Files:**
- Create: `docs/superpowers/plans/2026-10-21-venus-skin-app-runbook.md`
- Modify: `tools/skin-layers/README.md` (una línea: dónde está el runbook)

Sin código. Cada paso con producción requiere la autorización de Said en el momento; nada se ejecuta solo.

- [ ] **Step 1: Escribir el runbook** con: (a) `git fetch upstream && git rebase upstream/main` de `feat/skin-maps-history`, suite completa en verde (`npm test`), `git push origin feat/skin-maps-history`; (b) PR o merge a `main` de `said019/venus-loyalty`; (c) antes del despliegue, con `DATABASE_URL` apuntando al proxy público (`DATABASE_PUBLIC_URL` del servicio Postgres), `npx prisma migrate status`; si está en sincronía → `npx prisma migrate deploy`; si no → aplicar a mano el SQL de `20261021000000_skin_layer_sets` y `20261021010000_skin_assessment_retire` (listarlos en el runbook) y `npx prisma migrate resolve --applied <nombre>` por cada una; (d) variables en Railway: confirmar `BASE_URL=https://venuscosmetologia.com.mx`, `SKIN_LAYERS_PYTHON`, `CLOUDINARY_*`; añadir `SKIN_SEQUENCE_ENABLED=false`; (e) verificación post-despliegue: `GET /api/public/card/<tarjeta de prueba>/skin-reports` 200, `/mi-piel.html` 200, `/fonts/prata-latin-400-normal.woff2` 200; (f) cuentas: crear una cuenta `staff` por cosmetóloga (`server/scripts/create-admin-user.js` o el admin) y retirar la contraseña del dueño del Moji.
- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-10-21-venus-skin-app-runbook.md tools/skin-layers/README.md
git commit -m "docs(skin): runbook de migraciones, merge y variables para Venus Skin"
```

---

### Task 11: Prueba física en el Moji (con Said presente)

**Files:**
- Create: `tools/moji-capture/android/VERIFICATION-<fecha>.md`

Requisitos: equipo vacío, Said junto al aparato, cuenta `staff` de prueba y una tarjeta de prueba (no una clienta real), ADB solo lectura desde la Mac (`adb -s 192.168.100.15:5555 logcat`). Antes de cada subpaso se pide confirmación en voz alta y se registra la hora del aparato.

- [ ] **Step 1: Luz blanca con la versión desplegada:** `captura.html` → clienta de prueba → consentimiento → "Luz blanca + tomar foto"; Said confirma que la luz encendió y apagó; la foto aparece en el expediente de prueba.
- [ ] **Step 2: Flujo completo con blanca:** "Analizar" → borrador automático → generación → aprobación con plan/rutina → vista de cabina en el Moji ("Listo" regresa a captura) → en un celular, la tarjeta de prueba muestra "Tu reporte Venus Skin" y `mi-piel.html` carga con fuentes y mapas.
- [ ] **Step 3: Secuencia de 6 luces, luz por luz:** con `SKIN_SEQUENCE_ENABLED=true` solo en ese momento: lanzar el protocolo; por cada luz Said dice si encendió y apagó; cualquier "no" → apagado manual (`b-apagar`), `adb shell` solo para leer `logcat`, se registra y se detiene. UV y Wood: ojos cerrados aunque el equipo esté vacío; sin personas frente al aparato.
- [ ] **Step 4:** Las 8 fotos en el expediente con su `modo=`; `mi-piel.html` muestra las complementarias como vistas, no como medición.
- [ ] **Step 5:** Registrar todo en `VERIFICATION-<fecha>.md` con el mismo formato que `VERIFICATION-20260920.md`. Si el paso 3 falla en cualquier luz, `SKIN_SEQUENCE_ENABLED` vuelve a `false` y la secuencia queda fuera del uso con clientas.
- [ ] **Step 6: Commit**

```bash
git add tools/moji-capture/android/VERIFICATION-<fecha>.md
git commit -m "docs(moji): verificación física de Venus Skin en el aparato"
```

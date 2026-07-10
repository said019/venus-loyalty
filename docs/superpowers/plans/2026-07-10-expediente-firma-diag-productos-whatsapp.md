# Expediente (firma/diagnósticos/productos) + WhatsApp sin acuse de reagendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firma de láser visible en el admin, diagnósticos anteriores editables/borrables, pendiente rojo de "productos utilizados" con captura rápida, y eliminar el acuse automático de reagendamiento por WhatsApp.

**Architecture:** Cambios quirúrgicos sobre el monolito `public/admin.html` (+ CSS en `public/css/admin/admin-extra.css`) y dos routers Express (`src/routes/expedientes.js`, `src/routes/clientRecords.js`). Sin migraciones de DB (todos los campos ya existen). El webhook de Evolution deja de responder texto libre; solo notifica al panel.

**Tech Stack:** Express + Prisma (ESM), vanilla JS en admin.html, node --test.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-expediente-firma-diagnosticos-productos-design.md`
- Disciplina venus-loyalty: no romper el admin monolito; cambios incrementales, un dominio por commit; verificación con evidencia (`node --check`, arranque del server, y validación visual manual pedida a Said).
- El pendiente de productos aplica a TODAS las sesiones de tratamiento.
- Completar productos NO requiere rol admin (cualquier staff autenticado con `adminAuth`).
- El acuse de reagendar se elimina por completo; la NotificationsRepo del panel se conserva.
- Alertas/confirmaciones SIEMPRE con `venusAlert`/`venusConfirm`/`venusPrompt` (no `alert/confirm/prompt`).

---

### Task 1: WhatsApp — quitar acuse automático de reagendamiento

**Files:**
- Modify: `src/routes/webhookEvolution.js:382-392` (función `procesarFechaReagendamiento`)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `procesarFechaReagendamiento(cita, telefono, fechaTexto)` conserva su firma; ya no envía WhatsApp.

- [ ] **Step 1: Editar `procesarFechaReagendamiento`** — quitar el `evo.sendText` y el import dinámico de `getEvolutionClient`; dejar la actualización de `updatedAt` y la notificación del panel. Resultado exacto:

```js
async function procesarFechaReagendamiento(cita, telefono, fechaTexto) {
    console.log(`📅 Fecha de reagendamiento recibida para cita ${cita.id}: "${fechaTexto}"`);
    try {
        await prisma.appointment.update({ where: { id: cita.id }, data: { updatedAt: new Date() } });
        await NotificationsRepo.create({ type: 'alerta', icon: 'calendar-alt', title: 'Propuesta de reagendamiento', message: `${cita.clientName} propone reagendar ${cita.serviceName} para: "${fechaTexto}"`, read: false, entityId: cita.id });
        // Sin acuse automático por WhatsApp (decisión 2026-07-10): el equipo responde
        // manualmente; la propuesta llega como notificación al panel.
        console.log(`📅 Propuesta de reagendamiento guardada para cita ${cita.id}: ${fechaTexto}`);
    } catch (error) { console.error('Error procesando fecha de reagendamiento:', error); }
}
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check src/routes/webhookEvolution.js`
Expected: sin salida (exit 0)

- [ ] **Step 3: Confirmar que no quedan otros sendText de acuse en ese flujo**

Run: `grep -n "Recibimos tu solicitud" src/ -r`
Expected: sin resultados

- [ ] **Step 4: Commit**

```bash
git add src/routes/webhookEvolution.js
git commit -m "fix(whatsapp): sin acuse automático al proponer fecha de reagendamiento"
```

---

### Task 2: Backend — DELETE diagnóstico + PUT productos de sesión

**Files:**
- Modify: `src/routes/expedientes.js` (después de `POST /:cardId/diagnosis/:id/pdf`, ~línea 275)
- Modify: `src/routes/clientRecords.js` (después del `PUT /sessions/:sessionId`, ~línea 274)

**Interfaces:**
- Produces: `DELETE /api/expedientes/:cardId/diagnosis/:id` → `{ success: true }` | 404 `diagnostico_no_encontrado`.
- Produces: `PUT /api/client-records/sessions/:sessionId/products` body `{ productsUsed: string }` → `{ success: true, data: session }`; 400 si vacío. SIN `requireRole("admin")`.

- [ ] **Step 1: Agregar DELETE de diagnóstico en expedientes.js** (patrón idéntico al DELETE de laser-sessions):

```js
router.delete('/:cardId/diagnosis/:id', async (req, res) => {
  try {
    const record = await ensureRecord(req.params.cardId);
    const result = await prisma.facialDiagnosis.deleteMany({ where: { id: req.params.id, recordId: record.id } });
    if (result.count === 0) return fail(res, 404, 'diagnostico_no_encontrado');
    res.json({ success: true });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});
```

- [ ] **Step 2: Agregar PUT de productos en clientRecords.js:**

```js
// Completar SOLO "productos utilizados" de una sesión (pendiente rojo del expediente).
// A propósito sin requireRole("admin"): cualquier staff autenticado puede completar
// el pendiente; editar el resto de la sesión sigue siendo solo admin.
router.put('/sessions/:sessionId/products', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const productsUsed = String(req.body?.productsUsed || '').trim();
    if (!productsUsed) {
      return res.status(400).json({ success: false, error: 'productsUsed requerido' });
    }
    const session = await prisma.treatmentSession.update({
      where: { id: sessionId },
      data: { productsUsed }
    });
    res.json({ success: true, data: session });
  } catch (error) {
    console.error('Error registrando productos de sesión:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check src/routes/expedientes.js && node --check src/routes/clientRecords.js`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/routes/expedientes.js src/routes/clientRecords.js
git commit -m "feat(expediente): DELETE de diagnóstico y PUT de productos de sesión"
```

---

### Task 3: Frontend — firma visible en sesiones de láser

**Files:**
- Modify: `public/admin.html` — `renderLaserPanel` (~5452), `expEditLaserSession` (~5508), `expUpdateLaserSigStatus` (~5490), form láser (~3528-3534)
- Modify: `public/css/admin/admin-extra.css` — junto a `.exp-stacked-sig` (~3205)

**Interfaces:**
- Consumes: `laserSessions[].signatureClient` (dataURL PNG) ya presente en `expedienteDigitalCache`.
- Produces: `expViewLaserSignature(id)` global; `<img id="exp-laser-sig-preview">` en el form.

- [ ] **Step 1: Miniatura en cada fila firmada.** En `renderLaserPanel`, después de calcular `sigBadge`, agregar:

```js
const sigThumb = (s.signatureClient && String(s.signatureClient).indexOf('data:image') === 0)
  ? '<div class="exp-sig-thumb-wrap"><img class="exp-sig-thumb" src="' + s.signatureClient + '" alt="Firma de la clienta" title="Ver firma" onclick="expViewLaserSignature(' + "'" + s.id + "'" + ')"></div>'
  : '';
```

e insertar `sigThumb` en el HTML de la fila entre `obs` y `exp-stacked-actions`.

- [ ] **Step 2: Función para ampliar la firma** (después de `renderLaserPanel`):

```js
function expViewLaserSignature(id) {
  const arr = (expedienteDigitalCache && expedienteDigitalCache.laserSessions) || [];
  const s = arr.find(function (x) { return x.id === id; });
  if (!s || !s.signatureClient) return;
  openPhotoLightbox(s.signatureClient, '', s.signedAt || s.date);
}
```

- [ ] **Step 3: Firma visible al editar.** En el form (junto al `exp-laser-sig-status`) agregar `<img id="exp-laser-sig-preview" class="exp-sig-thumb" style="display:none;" alt="Firma guardada">`. Nueva variable global `expLaserEditingSignatureUrl = null` junto a las existentes (~4622). En `expEditLaserSession` set `expLaserEditingSignatureUrl = s.signatureClient || null;` antes de llamar `expUpdateLaserSigStatus()`; en `expResetLaserForm` y en el onSave de `expCaptureLaserSignature`, limpiarla (`= null`). En `expUpdateLaserSigStatus`, al final:

```js
const prev = document.getElementById('exp-laser-sig-preview');
if (prev) {
  const url = expLaserSignatureDataUrl || expLaserEditingSignatureUrl;
  if (url && String(url).indexOf('data:image') === 0) { prev.src = url; prev.style.display = ''; }
  else { prev.removeAttribute('src'); prev.style.display = 'none'; }
}
```

- [ ] **Step 4: CSS** en admin-extra.css junto a `.exp-stacked-sig`:

```css
      .exp-sig-thumb-wrap { margin: 8px 0 2px; }
      .exp-sig-thumb {
        display: inline-block; width: 120px; max-height: 56px; object-fit: contain;
        background: #fff; border: 1px solid var(--exp-line); border-radius: 8px;
        padding: 4px 8px; cursor: zoom-in;
      }
```

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/css/admin/admin-extra.css
git commit -m "feat(expediente): firma de la clienta visible en sesiones de láser"
```

---

### Task 4: Frontend — diagnósticos anteriores: editar, borrar, nuevo

**Files:**
- Modify: `public/admin.html` — form diagnóstico (~3473-3476), `renderDiagnosisPanel` (~5343), `expLoadDiagnosis` (~5362), nuevas funciones `expNewDiagnosis` / `expDeleteDiagnosis`

**Interfaces:**
- Consumes: `DELETE /api/expedientes/:cardId/diagnosis/:id` (Task 2), `expApi`, `venusConfirm`, `venusAlert`, `loadExpedienteDigital(cardId)`, `currentExpedienteCardId`.
- Produces: globals `expNewDiagnosis()`, `expDeleteDiagnosis(id)`; span `#exp-diag-save-label`.

- [ ] **Step 1: Form.** Botón submit pasa a `<button type="submit" class="btn primary"><i class="fas fa-save"></i> <span id="exp-diag-save-label">Guardar diagnóstico</span></button>` y se agrega en las acciones sticky `<button type="button" class="btn ghost" onclick="expNewDiagnosis()"><i class="fas fa-plus"></i> Nuevo diagnóstico</button>`.

- [ ] **Step 2: Filas con acciones.** En `renderDiagnosisPanel`, dentro de `exp-diag-row-main` después del bloque `pdf`, agregar:

```js
'<div class="exp-stacked-actions">' +
  '<button class="btn small ghost" onclick="event.stopPropagation(); expLoadDiagnosis(' + "'" + d.id + "'" + ')"><i class="fas fa-pen"></i> Editar</button> ' +
  '<button class="btn small ghost exp-btn-danger" onclick="event.stopPropagation(); expDeleteDiagnosis(' + "'" + d.id + "'" + ')"><i class="fas fa-trash"></i></button>' +
'</div>'
```

(el `pdf` ya usa `event.stopPropagation()`; conservar el onclick de la fila).

- [ ] **Step 3: Modo edición explícito.** Al final de `expLoadDiagnosis`, `document.getElementById('exp-diag-save-label').textContent = 'Guardar cambios';`. Nueva función:

```js
function expNewDiagnosis() {
  const f = document.getElementById('exp-diagnosis-form');
  if (f) f.reset();
  document.getElementById('exp-diag-id').value = '';
  const lbl = document.getElementById('exp-diag-save-label');
  if (lbl) lbl.textContent = 'Guardar diagnóstico';
}
```

- [ ] **Step 4: Borrado con confirmación.**

```js
async function expDeleteDiagnosis(id) {
  const cardId = currentExpedienteCardId;
  if (!cardId) return;
  if (!(await venusConfirm('¿Eliminar este diagnóstico? Esta acción no se puede deshacer.', { title: 'Confirmar', danger: true, okLabel: 'Eliminar' }))) return;
  try {
    const res = await expApi('/api/expedientes/' + encodeURIComponent(cardId) + '/diagnosis/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar diagnóstico');
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Error al eliminar diagnóstico');
    if (document.getElementById('exp-diag-id').value === id) expNewDiagnosis();
    await venusAlert('Diagnóstico eliminado');
    await loadExpedienteDigital(cardId);
  } catch (err) {
    console.error('[Diagnóstico] Error al eliminar:', err);
    await venusAlert('Error al eliminar el diagnóstico');
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add public/admin.html
git commit -m "feat(expediente): editar, borrar y nuevo en diagnósticos anteriores"
```

---

### Task 5: Frontend — pendiente rojo de productos + captura rápida

**Files:**
- Modify: `public/admin.html` — `renderExpedienteSessions` (~4226-4248), `viewSessionDetail` (~4562), nueva función `expFillSessionProducts`
- Modify: `public/css/admin/admin-extra.css` — junto a `.exp-badge-warn` (~2699)

**Interfaces:**
- Consumes: `PUT /api/client-records/sessions/:sessionId/products` (Task 2), `expedienteSessionsCache`, `venusPrompt`, `venusAlert`, `expApi`.
- Produces: global `expFillSessionProducts(id)`; clase CSS `.exp-badge-danger`.

- [ ] **Step 1: Badge en la lista.** En el template de `renderExpedienteSessions`, después de la línea de zonas, agregar:

```js
${!session.productsUsed ? `<div class="exp-session-products-pending"><span class="exp-badge exp-badge-danger" onclick="event.stopPropagation(); expFillSessionProducts('${session.id}')"><i class="fas fa-triangle-exclamation"></i> Falta registrar productos</span></div>` : ''}
```

- [ ] **Step 2: Captura rápida.**

```js
async function expFillSessionProducts(sessionId) {
  const products = await venusPrompt('¿Qué productos se utilizaron en esta sesión?');
  if (!products || !products.trim()) return;
  try {
    const response = await expApi(`/api/client-records/sessions/${sessionId}/products`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productsUsed: products.trim() })
    });
    if (!response.ok) throw new Error('Error al guardar productos');
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Error al guardar productos');
    const cached = expedienteSessionsCache.find(s => s.id === sessionId);
    if (cached) cached.productsUsed = products.trim();
    renderExpedienteSessions();
    await venusAlert('Productos registrados');
  } catch (error) {
    console.error('[Expediente] Error registrando productos:', error);
    await venusAlert('Error al registrar los productos');
  }
}
```

- [ ] **Step 3: Detalle.** En `viewSessionDetail`, reemplazar la línea de productos por:

```js
${session.productsUsed ? `<strong>Productos:</strong> ${session.productsUsed}\n` : `<strong>Productos:</strong> <span style="color:oklch(45% 0.150 25);font-weight:600;">⚠ Pendiente de registrar</span>\n`}
```

- [ ] **Step 4: CSS** junto a `.exp-badge-warn`:

```css
      .exp-badge-danger { background: oklch(95% 0.030 25); color: oklch(42% 0.150 25); border-color: oklch(85% 0.070 25); cursor: pointer; }
      .exp-badge-danger:hover { border-color: oklch(60% 0.140 25); }
      .exp-session-products-pending { margin-top: 6px; }
```

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/css/admin/admin-extra.css
git commit -m "feat(expediente): pendiente rojo de productos utilizados con captura rápida"
```

---

### Task 6: Verificación integral

- [ ] **Step 1: Suite existente**

Run: `npm test`
Expected: todos los tests pasan (mismos que en `main`).

- [ ] **Step 2: Arranque del server** (smoke): `node --check server.js` y arrancar `npm run dev` unos segundos verificando que registra rutas sin crash (o `node --check` de los 3 routers si el entorno no tiene DB/env).

- [ ] **Step 3: Validación manual de Said** (no automatizable): abrir un expediente → ver firma en sesión de láser firmada, editar/borrar un diagnóstico anterior, ver el pendiente rojo y capturar productos. Reportar honestamente qué no se pudo verificar en navegador.

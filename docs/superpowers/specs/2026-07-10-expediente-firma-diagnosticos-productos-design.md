# Expediente: firma visible, diagnósticos editables/borrables y pendiente de productos

**Fecha:** 2026-07-10
**Estado:** Aprobado por Said (los 3 cambios, alcance "todas las sesiones", productos completables por cualquier staff).

## Contexto

Tres peticiones sobre el expediente digital del admin (`public/admin.html` + `src/routes/expedientes.js` + `src/routes/clientRecords.js`):

1. La firma de la clienta en las sesiones de láser se guarda pero no se ve en ningún lado del admin (solo un badge "Firmada").
2. Los diagnósticos faciales anteriores no se pueden modificar ni borrar de forma explícita. Editar existe oculto (clic en la fila carga el form y "Guardar diagnóstico" sobrescribe sin avisar). Borrar no existe (ni UI ni endpoint).
3. El campo "Productos utilizados" de las sesiones de tratamiento es opcional y, si se queda vacío, nadie se entera. Se quiere un pendiente visible en rojo.

## Diseño

### 1. Firma visible en sesiones de láser

- En `renderLaserPanel` (admin.html), cada sesión con `signatureClient` (dataURL PNG) muestra la firma como miniatura (`<img>` ~120px de ancho, fondo claro, borde suave) junto al badge "Firmada".
- Clic en la miniatura la amplía (reutilizar el lightbox de fotos existente `openPhotoLightbox` o un overlay simple).
- Al editar una sesión firmada (`expEditLaserSession`), junto al estado "Ya firmada" se muestra la misma miniatura para que se pueda verificar quién firmó.
- Sin cambios de backend: `GET /api/expedientes/:cardId` ya devuelve `signatureClient` completo en `laserSessions`.

### 2. Diagnósticos anteriores: editar y borrar

- **UI (sección "Diagnósticos anteriores"):** cada fila gana dos botones: "Editar" (hace lo que hoy hace el clic en la fila: carga al form) y "Eliminar" (con `venusConfirm` destructivo).
- Al cargar un diagnóstico para editar, el botón del form cambia a "Guardar cambios" y aparece un botón "Nuevo diagnóstico" que limpia el form (`exp-diag-id` vacío) para evitar sobrescrituras accidentales.
- **Backend:** nuevo `DELETE /api/expedientes/:cardId/diagnosis/:id` (mismo patrón que el DELETE de laser-sessions: `deleteMany({ id, recordId })`, 404 si count 0). Protegido por el `adminAuth` que ya cubre el router.

### 3. Pendiente rojo de productos utilizados

- **Alcance:** TODAS las sesiones de tratamiento (facial, corporal, masaje, etc.), no solo faciales.
- En `renderExpedienteSessions`, toda sesión sin `productsUsed` (vacío/null) muestra badge rojo "Falta registrar productos".
- Clic en el badge abre una captura rápida (venusPrompt / mini-diálogo) solo del campo productos y lo guarda.
- En `viewSessionDetail`, si no hay productos se muestra la línea "Productos: ⚠ pendiente de registrar" en rojo.
- **Backend:** nuevo `PUT /api/client-records/sessions/:sessionId/products` que actualiza ÚNICAMENTE `productsUsed`. Sin `requireRole("admin")` (cualquier staff autenticado puede completar el pendiente). Editar el resto de la sesión sigue siendo solo admin (endpoint existente sin cambios).

## Fuera de alcance

- PDF de sesiones de láser.
- Cambiar permisos del PUT/DELETE general de sesiones.
- Refactor de admin.html.

## Errores y verificación

- Endpoints nuevos siguen el patrón `fail(res, ...)` existente y validan pertenencia al `recordId` de la clienta.
- Tests de nodo (`node --test`) para los endpoints nuevos si el arnés de tests existente lo permite sin DB real; si no, verificación manual documentada con evidencia (curl contra server local).
- Frontend: verificación manual en navegador (sin arnés de tests para admin.html); se pedirá validación visual a Said.

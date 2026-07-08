# Expedientes digitales Venus — Diseño

**Fecha:** 2026-07-08 · **Estado:** Aprobado por Said · **Repo:** `venus-loyalty` (el que sirve venuscosmetologia.com.mx en Railway)

## Problema

El expediente actual (`ClientRecord` + modal en `public/admin.html`) es genérico: campos sueltos
(edad, alergias, observaciones) que no corresponden a los formatos reales del consultorio.
Los formatos reales son 4 documentos en papel/PDF que hoy se llenan a mano y viven en carpetas
físicas o archivos sueltos:

1. **Ficha Clínica** — datos personales, "datos de interés" (10 preguntas Sí/No con detalle),
   condición de piel, cuestionarios por condición (acné, cicatrices atróficas, pigmentaciones,
   envejecimiento, ojeras inflamadas, ojeras pigmentadas, piel sensible), rutina skincare
   día/noche, autorización de fotos, firma de paciente y cosmetóloga.
2. **Consentimiento informado de depilación láser diodo** — texto legal + firma del paciente
   y de la responsable del tratamiento.
3. **Ficha de seguimiento fotodepilación láser** — tabla por sesión: fecha, cosmetóloga, zona,
   frecuencia, fluencia, intensidad láser, observaciones, firma.
4. **Diagnóstico Facial** — lo llena la cosmetóloga: paciente, tipo de piel, alteración/condición,
   causas, tx cosmético, pronóstico, costo.

Además existen PDFs escaneados de la mayoría de las clientas actuales que deben quedar
adjuntos a su expediente.

## Decisiones tomadas (con el dueño)

| Decisión | Elección |
|---|---|
| Quién llena qué | **Híbrido**: la clienta llena Ficha Clínica y Consentimiento desde su celular (link); la cosmetóloga llena Diagnóstico Facial y Seguimiento láser en el admin |
| Firmas | **Dibujadas en pantalla** (canvas), embebidas en el PDF final |
| Almacenamiento | **BD (Postgres/Prisma) como fuente de verdad + PDF generado subido a Google Drive** como evidencia inmutable, en carpeta por clienta |
| PDFs escaneados viejos | **Subir tal cual** desde el admin (drag & drop) a la carpeta Drive de la clienta; sin transcripción |
| Envío del link | **Automático** en el WhatsApp de confirmación de la PRIMERA cita + **botón manual** "Enviar ficha" en el admin |
| Enfoque | **A: Formularios dedicados** (páginas a medida idénticas al formato Venus), NO form-builder genérico, NO solo-PDFs |

## Arquitectura

```
Clienta (celular)                        Admin (cosmetóloga)
   │ GET /ficha/:token                       │ modal Expediente (admin.html)
   │ GET /consentimiento/:token              │ pestañas: Ficha | Consentimientos |
   ▼                                         │ Diagnóstico | Láser | Sesiones/Fotos | Documentos
public/ficha-clinica.html                    ▼
public/consentimiento-laser.html      /api/expedientes/* (adminAuth)
   │ (fetch con token)                       │
   ▼                                         ▼
        src/routes/expedientes.js  (router nuevo, monta /api/expedientes)
                     │
   ┌─────────────────┼──────────────────────┐
   ▼                 ▼                      ▼
Prisma (Postgres)  src/services/        src/services/
IntakeForm,        expedientePdf.js     driveService.js
ConsentDoc,        (pdf-lib, formato    (googleapis drive v3,
FacialDiagnosis,    Venus + firmas)      service account, carpeta
LaserSessionLog,                         por clienta)
ClientDocument
```

- **Tokens**: JWT firmado (`cardId`, `purpose: 'ficha'|'consent'`, exp 30 días) — la clienta no
  necesita login. Módulo `src/services/fichaTokens.js`.
- **Drive**: mismo patrón que Valiance (service account). La autenticación reutiliza las
  credenciales de Google ya configuradas para Calendar; scope adicional `drive`. Carpeta raíz
  vía env `GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID` (compartida con el email de la service account).
  Estructura: `Expedientes/{Nombre – teléfono}/`.
- **Resiliencia**: si la subida a Drive falla, el registro queda `driveUploadPending=true` y un
  cron lo reintenta (el scheduler ya existe en `src/scheduler/cron.js`).
- **WhatsApp**: plantilla nueva en `src/services/whatsapp-v2.js`; el hook de primera cita se
  engancha donde se envía la confirmación de cita creada.

## Modelo de datos (nuevo, cuelga del ClientRecord existente)

- `IntakeForm` (1:1 con ClientRecord) — status `draft|signed`; datos personales; `interestData Json`
  (ciclo menstrual R/IR/NP; embarazo, lactancia, alergias, vitaminas, medicamentos, implantes,
  anticonceptivos, intervenciones, protector solar — cada uno `{value: bool, detail?: string}`);
  condición de piel (4 campos texto); `questionnaires Json` (solo las condiciones que apliquen);
  `routineDay/routineNight Json`; `photoConsent Boolean`; firmas (dataURL PNG); `signedAt`;
  `pdfDriveFileId/pdfWebViewLink/driveUploadPending`.
- `ConsentDoc` (1:N) — `type='laser-diodo'`, `textVersion`, firma, `signedAt`, campos PDF/Drive.
- `FacialDiagnosis` (1:N) — tipo de piel, alteración, causas, tx cosmético, pronóstico, costo.
- `LaserSessionLog` (1:N) — fecha, cosmetóloga, zona, frecuencia, fluencia, intensidad, observaciones.
- `ClientDocument` (1:N) — archivos en Drive: nombre, `driveFileId`, `webViewLink`, `mimeType`,
  `source: 'scan-import'|'generated'`.
- `ClientRecord` gana las relaciones + `fichaLinkSentAt DateTime?` (anti-spam del link).
- Al firmarse la ficha se denormalizan a `ClientRecord` los campos resumen que el admin ya usa
  (`skinType`, `allergies`, `age`) para no romper la UI existente.
- **Nada de lo existente se elimina** (TreatmentSession, ClientPhoto/Cloudinary siguen igual).

## Flujos

**Clienta — Ficha Clínica**: recibe link WhatsApp → página mobile con look Venus por pasos
(datos → datos de interés → condición → cuestionario SOLO de su condición → rutina →
autorización de fotos SÍ/NO → firma) → guarda borrador automático (PUT draft) → al firmar:
POST submit → BD `signed` → genera PDF Venus → sube a Drive → notificación en admin
(NotificationsRepo, patrón existente).

**Clienta — Consentimiento láser**: mismo esquema; muestra el texto legal completo (versionado
en código) → firma → PDF → Drive. Se envía manualmente a clientas de láser.

**Cosmetóloga — Diagnóstico Facial y Láser**: pestañas del modal expediente; formularios simples
con guardado a BD; el diagnóstico puede exportarse a PDF/Drive con un botón; el seguimiento
láser es una tabla editable (una fila por sesión).

**Documentos**: pestaña con dropzone (multer memoria → Drive → `ClientDocument`); lista con
link `webViewLink`; sirve para importar los escaneados históricos.

## Privacidad y seguridad

- Datos de salud = datos sensibles (LFPDPPP México): páginas públicas solo con token JWT válido
  y de propósito único; endpoints admin tras `adminAuth`; carpeta Drive NO pública (permisos
  solo de la cuenta del negocio); el texto de autorización de fotografías del formato se
  reproduce íntegro con opciones SÍ/NO AUTORIZO.
- Los PDFs escaneados de clientas NUNCA se commitean al repo (quedaron en
  `~/Desktop/Expedientes-escaneados-Venus/`, fuera de git).
- Los dataURL de firmas viven en BD y dentro del PDF; no se sirven públicamente.

## Fuera de alcance (YAGNI)

- Form-builder / editor de formularios.
- OCR o transcripción automática de los escaneados.
- Portal de la clienta para ver su expediente (solo llena formularios).
- Otros consentimientos además del de láser diodo (el modelo `ConsentDoc.type` ya lo permite
  a futuro, pero solo se implementa láser).
- Firma electrónica avanzada/certificada (la firma dibujada + metadatos de fecha/teléfono es
  el estándar del giro).

## Criterios de éxito

1. Una clienta nueva agenda su primera cita → recibe el link → llena y firma desde su celular
   → su PDF aparece en la carpeta Drive correcta y su ficha se ve completa en el admin.
2. La cosmetóloga captura diagnóstico y sesiones de láser en el admin sin papel.
3. Los escaneados históricos quedan adjuntos al expediente de cada clienta vía drag & drop.
4. Si Drive está caído, nada se pierde: el PDF se reintenta y la BD conserva todo.

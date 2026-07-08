# Expedientes Digitales Venus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitalizar los 4 formatos del consultorio (Ficha Clínica, Consentimiento láser, Diagnóstico Facial, Seguimiento láser) con firma en pantalla, PDF con formato Venus subido a Google Drive por clienta, e importación de escaneados históricos.

**Architecture:** La clienta llena Ficha/Consentimiento en páginas públicas mobile accesibles por token JWT (sin login); la cosmetóloga captura Diagnóstico/Láser en el modal de expediente del admin. Postgres (Prisma) es la fuente de verdad; al firmar se genera un PDF (pdf-lib) y se sube a Drive (googleapis, service account ya configurada para Calendar) a la carpeta de la clienta. Router nuevo `src/routes/expedientes.js`; servicios nuevos `fichaTokens.js`, `driveService.js`, `expedientePdf.js`, `consentTexts.js`.

**Tech Stack:** Node 18+ ESM, Express, Prisma/Postgres, googleapis@166 (ya instalada), pdf-lib (nueva dep), jsonwebtoken (ya instalada), signature_pad via CDN, multer memoria (patrón existente), Evolution API WhatsApp (existente).

**Spec:** `docs/superpowers/specs/2026-07-08-expedientes-digitales-design.md` (leerlo antes de empezar).

## Global Constraints

- **Repo de trabajo:** `/Users/saidromero/Desktop/Venus-cosmetologia/migration/venus-loyalty` — rama `main`. Es el repo DESPLEGADO (Railway → venuscosmetologia.com.mx). NO trabajar en `/Users/saidromero/Desktop/Venus-cosmetologia` (repo raíz abandonado).
- **NUNCA `git push` sin autorización explícita del usuario en ese momento.** Commits locales sí, uno por task.
- **NO tocar** la rama `wip-local-backup-20260707-1449` (WIP del usuario).
- **NUNCA commitear PDFs de clientas reales** ni datos personales. Los escaneados viven en `~/Desktop/Expedientes-escaneados-Venus/` (fuera de git).
- Después de editar cualquier `.js`: `node --check <archivo>` debe pasar.
- Todo texto visible para clientas/staff en **español mexicano**, tono cálido Venus (ver copys existentes en `src/services/whatsapp-v2.js`).
- No borrar ni renombrar nada existente: `ClientRecord`, `TreatmentSession`, `ClientPhoto`, Cloudinary y el router `clientRecords.js` siguen funcionando igual.
- El repo no tiene framework de tests: la verificación es `node --check` + scripts en `scripts/` (patrón existente `scripts/test-*.js`) + curl manual. Los scripts que toquen BD/Drive requieren `.env` (existe en la raíz del repo local).
- Variables de entorno NUEVAS (agregarlas a Railway antes del deploy final; en local ya hay `.env`): `GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID` (carpeta Drive compartida con el email de la service account), `FICHA_TOKEN_SECRET` (cualquier string larga; si falta, el código cae a `ADMIN_JWT_SECRET`).
- `BASE_URL` ya existe en Railway y se usa para armar links públicos.

## Hechos del código que este plan asume (verificados 2026-07-08)

- Auth admin: `import { adminAuth, requireRole } from '../../lib/auth.js'` (así lo hace `src/routes/clientRecords.js:8`).
- Service account Google: `loadServiceAccount()` exportada por `lib/google.js` (acepta `GOOGLE_SA_JSON_B64`, o `GOOGLE_SA_EMAIL`+`GOOGLE_SA_PRIVATE_KEY`, o keyFile `GOOGLE_APPLICATION_CREDENTIALS`). `src/services/googleCalendarService.js:buildCalendarAuth()` es el patrón a copiar.
- Prisma client: `import { prisma } from '../db/index.js'`.
- Notificaciones admin: `NotificationsRepo.create({ type, icon, title, message, read:false, entityId })` de `src/db/repositories.js`.
- WhatsApp: `WhatsAppService` en `src/services/whatsapp-v2.js`; envía con helper interno `sendViaEvolution(phone, text)`. La confirmación de cita nueva se dispara con `WhatsAppService.sendConfirmation(appointment)` — hay 2 sitios de creación en `server.js` (buscar con `grep -n "sendConfirmation(appointment" server.js`, ~líneas 1629 y 4739; los números pueden moverse).
- Modelos existentes: `ClientRecord` (cardId @unique) / `TreatmentSession` / `ClientPhoto` en `prisma/schema.prisma` (~línea 386). `Card` tiene `id`, `name`, `phone @unique`.
- Modal expediente admin: `public/admin.html` — anclas: `id="expediente-modal"` (~3274), `class="expediente-tabs"` (~3286), JS `openClientRecord()` y `// ===== SISTEMA DE EXPEDIENTE DE CLIENTA =====` (~3842). El archivo mide ~17k líneas: SIEMPRE ubicar por string de anclaje, nunca por número de línea.
- Router expedientes actual montado: `app.use('/api/client-records', clientRecordsRouter)` en `server.js` (~646). El nuevo router se monta al lado.
- Páginas públicas estáticas viven en `public/` y `express.static("public", { index:false })` las sirve; las rutas HTML explícitas usan `res.sendFile` (patrón en `server.js` ~2342).

---

### Task 1: Modelos Prisma + db push

**Files:**
- Modify: `prisma/schema.prisma` (bloque `// ========== EXPEDIENTES DE CLIENTAS ==========`)

**Interfaces:**
- Produces: modelos `IntakeForm`, `ConsentDoc`, `FacialDiagnosis`, `LaserSessionLog`, `ClientDocument`; `ClientRecord` gana relaciones y `fichaLinkSentAt`.

- [ ] **Step 1: Agregar los modelos al schema**

En `prisma/schema.prisma`, dentro de `model ClientRecord`, agregar después de `photos   ClientPhoto[]`:

```prisma
  fichaLinkSentAt DateTime?

  intake        IntakeForm?
  consents      ConsentDoc[]
  diagnoses     FacialDiagnosis[]
  laserSessions LaserSessionLog[]
  documents     ClientDocument[]
```

Y después del modelo `ClientPhoto` (antes del comentario de mensajes WhatsApp), agregar:

```prisma
// Ficha Clínica digital (la llena la clienta desde su celular)
model IntakeForm {
  id       String       @id @default(cuid())
  recordId String       @unique
  record   ClientRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)

  status String @default("draft") // draft | signed

  // Datos personales (nombre/teléfono se precargan de Card pero son editables)
  fullName       String?
  birthDate      String?
  age            Int?
  phone          String?
  profession     String?
  address        String?
  socialMedia    String?
  referralSource String? // "Medio por el cual se enteró de nosotros"

  // Datos de interés: { cicloMenstrual:'R'|'IR'|'NP', embarazo:{value,detail}, lactancia:{...},
  //  alergias:{...}, vitaminas:{...}, medicamentos:{...}, implantes:{...},
  //  anticonceptivos:{...}, intervenciones:{...}, protectorSolar:{...} }
  interestData Json?

  // Condiciones, padecimientos y enfermedades de la piel
  skinCondition      String? // "Condición de la piel que se busca mejorar"
  conditionSince     String?
  previousTreatments String?
  treatmentReactions String?

  // Cuestionarios por condición: { acne:{...}, cicatrices:{...}, pigmentaciones:{...},
  //  envejecimiento:{...}, ojerasInflamadas:{...}, ojerasPigmentadas:{...}, pielSensible:{...} }
  questionnaires Json?

  routineDay   Json? // array de strings
  routineNight Json?

  photoConsent    Boolean? // SÍ/NO AUTORIZO fotografías
  signatureClient String?  // dataURL PNG
  signatureStaff  String?
  signedAt        DateTime?

  pdfDriveFileId     String?
  pdfWebViewLink     String?
  driveUploadPending Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("intake_forms")
}

// Consentimientos firmados (hoy solo depilación láser diodo)
model ConsentDoc {
  id       String       @id @default(cuid())
  recordId String
  record   ClientRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)

  type        String @default("laser-diodo")
  textVersion String @default("2026-07")
  status      String @default("pending") // pending | signed

  signatureClient String?
  signedAt        DateTime?

  pdfDriveFileId     String?
  pdfWebViewLink     String?
  driveUploadPending Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("consent_docs")
}

// Diagnóstico facial (lo llena la cosmetóloga en el admin)
model FacialDiagnosis {
  id       String       @id @default(cuid())
  recordId String
  record   ClientRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)

  skinType   String?
  alteration String? // Alteración y/o condición de piel
  causes     String?
  cosmeticTx String? // TX cosmético
  prognosis  String?
  cost       String?
  staffName  String?

  pdfDriveFileId String?
  pdfWebViewLink String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("facial_diagnoses")
}

// Ficha de seguimiento fotodepilación láser (una fila por sesión)
model LaserSessionLog {
  id       String       @id @default(cuid())
  recordId String
  record   ClientRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)

  date           DateTime @default(now())
  staffName      String?
  zone           String?
  frequency      String?
  fluence        String?
  laserIntensity String?
  observations   String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("laser_session_logs")
}

// Archivos del expediente en Google Drive (escaneados importados y PDFs generados)
model ClientDocument {
  id       String       @id @default(cuid())
  recordId String
  record   ClientRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)

  name        String
  mimeType    String?
  driveFileId String
  webViewLink String?
  source      String @default("scan-import") // scan-import | generated
  sizeBytes   Int?

  uploadedAt DateTime @default(now())

  @@map("client_documents")
}
```

- [ ] **Step 2: Validar y aplicar el schema**

Run: `npx prisma validate && npx prisma db push`
Expected: `The schema is valid` y `Your database is now in sync`. (Usa el `DATABASE_URL` del `.env` local, que apunta a la BD de Railway — coordinar con el usuario si prefiere probar en otra BD primero.)

Run: `npx prisma generate`
Expected: cliente regenerado sin errores.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(expedientes): modelos IntakeForm, ConsentDoc, FacialDiagnosis, LaserSessionLog, ClientDocument"
```

---

### Task 2: Tokens de acceso público (`fichaTokens.js`)

**Files:**
- Create: `src/services/fichaTokens.js`
- Create: `scripts/test-ficha-tokens.js`

**Interfaces:**
- Produces: `signFichaToken(cardId, purpose)` → string JWT (exp 30d); `verifyFichaToken(token, purpose)` → `{ cardId }` o lanza Error. `purpose` ∈ `'ficha' | 'consent'`.

- [ ] **Step 1: Escribir el script de prueba (falla porque el módulo no existe)**

Create `scripts/test-ficha-tokens.js`:

```js
// Prueba manual: node scripts/test-ficha-tokens.js
import 'dotenv/config';
import { signFichaToken, verifyFichaToken } from '../src/services/fichaTokens.js';

const t = signFichaToken('card_test_123', 'ficha');
const out = verifyFichaToken(t, 'ficha');
if (out.cardId !== 'card_test_123') throw new Error('cardId no coincide');

let threw = false;
try { verifyFichaToken(t, 'consent'); } catch { threw = true; }
if (!threw) throw new Error('debió rechazar propósito distinto');

try { verifyFichaToken('token-basura', 'ficha'); threw = false; } catch { threw = true; }
if (!threw) throw new Error('debió rechazar token inválido');

console.log('✅ fichaTokens OK');
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node scripts/test-ficha-tokens.js`
Expected: FAIL `Cannot find module '../src/services/fichaTokens.js'`

- [ ] **Step 3: Implementar**

Create `src/services/fichaTokens.js`:

```js
// src/services/fichaTokens.js
// Tokens firmados para que la clienta llene formularios sin login.
// El token viaja en el link de WhatsApp: /ficha/:token o /consentimiento/:token
import jwt from 'jsonwebtoken';

const SECRET = process.env.FICHA_TOKEN_SECRET || process.env.ADMIN_JWT_SECRET;
const EXPIRY = '30d';
const PURPOSES = new Set(['ficha', 'consent']);

export function signFichaToken(cardId, purpose) {
  if (!PURPOSES.has(purpose)) throw new Error(`purpose inválido: ${purpose}`);
  if (!SECRET) throw new Error('FICHA_TOKEN_SECRET/ADMIN_JWT_SECRET no configurado');
  return jwt.sign({ cardId, purpose }, SECRET, { expiresIn: EXPIRY });
}

export function verifyFichaToken(token, purpose) {
  const payload = jwt.verify(token, SECRET); // lanza si es inválido/expirado
  if (payload.purpose !== purpose) throw new Error('purpose no coincide');
  return { cardId: payload.cardId };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --check src/services/fichaTokens.js && node scripts/test-ficha-tokens.js`
Expected: `✅ fichaTokens OK`

- [ ] **Step 5: Commit**

```bash
git add src/services/fichaTokens.js scripts/test-ficha-tokens.js
git commit -m "feat(expedientes): tokens JWT para formularios públicos de clienta"
```

---

### Task 3: Servicio Google Drive (`driveService.js`)

**Files:**
- Create: `src/services/driveService.js`
- Create: `scripts/test-drive.js`

**Interfaces:**
- Consumes: `loadServiceAccount()` de `lib/google.js` (mismo cargador que Calendar/Wallet).
- Produces: `ensureClientFolder(card)` → `folderId` (crea/encuentra `"{name} – {phone}"` bajo la carpeta raíz); `uploadBuffer({ folderId, name, mimeType, buffer })` → `{ id, webViewLink }`; `isDriveConfigured()` → boolean.

- [ ] **Step 1: Escribir smoke test manual (falla)**

Create `scripts/test-drive.js`:

```js
// Prueba manual contra Drive real: node scripts/test-drive.js
// Requiere GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID y credenciales SA en .env
import 'dotenv/config';
import { ensureClientFolder, uploadBuffer, isDriveConfigured } from '../src/services/driveService.js';

if (!isDriveConfigured()) { console.log('⚠️ Drive no configurado (falta GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID)'); process.exit(1); }

const folderId = await ensureClientFolder({ name: 'Prueba Sistema', phone: '5200000000000' });
console.log('folderId:', folderId);
const res = await uploadBuffer({ folderId, name: `test-${Date.now()}.txt`, mimeType: 'text/plain', buffer: Buffer.from('hola venus') });
console.log('✅ Drive OK →', res.webViewLink);
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node scripts/test-drive.js`
Expected: FAIL `Cannot find module '../src/services/driveService.js'`

- [ ] **Step 3: Implementar**

Create `src/services/driveService.js`:

```js
// src/services/driveService.js
// Sube expedientes (PDFs generados y escaneados) a Google Drive.
// Usa la MISMA service account que Calendar/Wallet (lib/google.js loadServiceAccount).
// Estructura: carpeta raíz (GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID, compartida con la SA)
//   └── "{Nombre} – {teléfono}" (una carpeta por clienta, creada on-demand)
import { google } from 'googleapis';
import { loadServiceAccount } from '../../lib/google.js';

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID;
const SCOPES = ['https://www.googleapis.com/auth/drive'];

let driveClient = null;

export function isDriveConfigured() {
  return Boolean(ROOT_FOLDER_ID);
}

async function getDrive() {
  if (driveClient) return driveClient;
  const { client_email, private_key } = loadServiceAccount();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: SCOPES,
  });
  driveClient = google.drive({ version: 'v3', auth: await auth.getClient() });
  return driveClient;
}

// Escapa comillas simples para queries de Drive
const q = (s) => String(s).replace(/'/g, "\\'");

export async function ensureClientFolder(card) {
  if (!ROOT_FOLDER_ID) throw new Error('GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID no configurado');
  const drive = await getDrive();
  const folderName = `${card.name || 'Clienta'} – ${card.phone || 'sin-tel'}`.trim();

  const found = await drive.files.list({
    q: `name='${q(folderName)}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (found.data.files?.length) return found.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [ROOT_FOLDER_ID],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id;
}

export async function uploadBuffer({ folderId, name, mimeType, buffer }) {
  const drive = await getDrive();
  const { Readable } = await import('stream');
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { id: res.data.id, webViewLink: res.data.webViewLink };
}
```

- [ ] **Step 4: Verificación**

Run: `node --check src/services/driveService.js`
Expected: sin errores.

Run (solo si el usuario ya creó la carpeta y la env var; si no, saltar y anotarlo): `node scripts/test-drive.js`
Expected: `✅ Drive OK → https://drive.google.com/...` y el archivo visible en la carpeta.

> Nota para el usuario/operador: crear en el Drive del negocio una carpeta "Expedientes Venus", compartirla (Editor) con el `client_email` de la service account (visible con `node -e "import('./lib/google.js').then(async m=>console.log((m.loadServiceAccount()).client_email))"`), copiar el ID de la carpeta (parte final de la URL) a `GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID` en `.env` local y en Railway.

- [ ] **Step 5: Commit**

```bash
git add src/services/driveService.js scripts/test-drive.js
git commit -m "feat(expedientes): servicio Google Drive (carpeta por clienta + upload)"
```

---

### Task 4: Texto legal del consentimiento (`consentTexts.js`)

**Files:**
- Create: `src/services/consentTexts.js`

**Interfaces:**
- Produces: `CONSENT_LASER_DIODO` = `{ type:'laser-diodo', version:'2026-07', title, sections: [{heading, body}] }`. Lo consumen la página pública (via API) y el generador de PDF.

- [ ] **Step 1: Crear el módulo con el texto ÍNTEGRO del formato en papel**

Create `src/services/consentTexts.js` (el texto es transcripción fiel del PDF del consultorio; no resumir ni parafrasear):

```js
// src/services/consentTexts.js
// Texto legal ÍNTEGRO del consentimiento informado (transcrito del formato en papel).
// Si el consultorio cambia el texto, crear una NUEVA versión (no editar la vieja):
// los documentos firmados referencian textVersion.
export const CONSENT_LASER_DIODO = {
  type: 'laser-diodo',
  version: '2026-07',
  title: 'INFORMACIÓN Y CONSENTIMIENTO INFORMADO DE TRATAMIENTO (DEPILACIÓN LASER DIODO)',
  sections: [
    {
      heading: '',
      body: 'Este documento de consentimiento informado ha sido preparado para ayudar al personal de Venus Cosmetology a informarle sobre el procedimiento de DEPILACIÓN LASER DIODO sus riesgos y los cuidados pre y post tratamiento. Es importante que lea ésta información de forma cuidadosa y completa.'
    },
    {
      heading: '¿EN QUE CONSISTE EL TRATAMIENTO?',
      body: 'El dispositivo láser trabaja mediante la emisión de pulsos de energía luminica que penetran la piel y destruyen los folículos del pilosos, encargados de hacer crecer el pelo, estos a su vez, transmiten la energía a las células germinativas que hacen que el pelo crezca, destruyéndolas, y haciendo que no vuelvan a reproducirse.'
    },
    {
      heading: '¿PARA QUE SE UTILIZA?',
      body: 'La depilación láser es un procedimiento no-invasivo diseñado para eliminar o disminuir el pelo no deseado de diversas partes del cuerpo. Gracias a su mayor longitud de onda, es un tipo de láser que penetra mejor en la piel por lo cual, es muy recomendado su uso en personas de pieles más oscuras o vello grueso. Las personas con el vello negro o marrón son las que más partido y beneficios pueden sacar a este tipo de láser.'
    },
    {
      heading: '¿CUANTAS SESIONES SON NECESARIAS?',
      body: 'El tiempo de cada sesión de depilación con láser de diodo puede variar entre los 15 minutos hasta las 2 horas aproximadamente. Este tiempo varia y depende de lo amplia que sea la zona de la piel que se va a tratar.\nLa duración completa del tratamiento suele ser entre tres meses y uno o dos años. Este tiempo va a depender de las condiciones individuales de cada persona, tipo de piel, tipo de vello, etc. El tratamiento del pelo claro-fino requiere sesiones de tratamiento adicionales que pueden variar en su grado de efectividad.\nLos resultados clínicos de la depilación láser también pueden variar en función del tipo de piel del paciente, los niveles hormonales e influencias hereditarias. Por lo tanto algunos pacientes pueden experimentar resultados parciales y otros ningún tipo de mejoria o resultados. Este último caso es infrecuente y se trata de personas cuyo organismo no responde al tratamiento láser. Como estos casos son impredecibles y no existen estudios que permitan detectarlos, la decisión de realizarse este tratamiento de depilación láser es electivo y el gasto económico que conlleva es exclusiva responsabilidad del paciente. Se advierte que futuros cambios y/o disfunciones hormonales pueden causar crecimiento de pelo adicional. El procedimiento de depilación láser implica una serie de tratamientos o sesiones. Áreas del cuerpo donde la piel es gruesa, como por ejemplo la espalda, el rostro y el cuello usualmente requieren mayor número de sesiones y en general se logra la reducción parcial del pelo y/o el afinamiento del mismo.\nEn depilación láser se considera que unos resultados aceptables están definidos como: menor número de pelos o menor densidad de vello (no la ausencia absoluta del mismo): pelo más fino; recrecimiento más lento; pelos más claros; no se puede obtener la ausencia total de vello en la región anatómica tratada mediante láser de por vida. Nunca se debe esperar una ausencia total de vello en las zonas tratadas con depilación láser.\nLa cantidad de pelo activable que porta el ser humano en el rostro es muy superior al de otras zonas del cuerpo, por eso, el número de sesiones a realizar en depilación facial es superior al de otras zonas. El pelo de la región facial femenina y el pelo del pecho, abdomen, areola y linea alba están sujetos a influjos hormonales. Por eso no podemos garantizar la desaparición absoluta del pelo, ya que la presencia de cambios hormonales puede generar pelo a lo largo de la vida del paciente. El resultado de la depilación facial femenina puede estar muy condicionado por disfunciones hormonales del paciente y que a veces es necesario controlar además de someterse al tratamiento de depilación.\nLos varones que presentan pelo en la espalda y el tórax suelen empezar a producir pelo en torno a los 20 años y estan el capacidad fisiológica de seguir produciendo nuevos folículos pilosos hasta aproximadamente los 50 años. Es decir, la densidad de pelo que presenta un varón joven en su tronco, abdomen y espalda no es estable. Los varones que se depiler estas zonas, deben saber que van a necesitar una o algunas sesiones de repaso cada varios meses y/o años, para volver a dejar la zona depllada. Los varones que se depilen con láser la zona facial, deben saber que esta zona está sujeta a influjos hormonales al igual que en la mujer. Se necesitará un tratamiento prolongado de varias sesiones más que el promedio pare otras zona para alcanzar la reducción de la densidad del pelo, porcentaje de reducción variable en función de características como la edad, la mayor cantidad de folículos en el hombre que en la mujer, las influencias hormonales y hereditarias.\nSe necesitarán 2 o más sesiones de mantenimiento anuales dependiendo cada caso en particular.'
    },
    {
      heading: '¿QUE SENTIRE DURANTE LA APLICACIÓN?',
      body: 'Durante la aplicación del láser de diodo se puede sentir un pequeño o leve escozor u hormigueo en la zona sobre la cual se está aplicando el láser.'
    },
    {
      heading: '¿EN QUE CASOS ESTA CONTRAINDICADO?',
      body: '• No se recomienda en pieles obscuras\n• Hirsutismo: Exceso de vello corporal\n• Enfermedades que se acompañan de fotosensibilidad como lupus.\n• Medicamentos que pueden dar fotosensibilidad: tretinoina e isotretinoina, accutane.\n• Estar tomando un tratamiento de anticoagulantes.\n• Tener tendencia a formar cicatrices queloides.\n• Embarazo.\n• Infección por herpes: En caso de sufrir alguna infección de este tipo, comunicárselo al especialista que va a aplicar la depilación láser. Es conveniente que antes de comenzar el tratamiento pases varios días tomando medicación antiviral y que se continúe el tratamiento al menos una semana más. Esto es primordial si se sufre de lesiones viricas en el área que se planea someter a la depilación láser.\n• Bronceado, área de tratamiento de maquillaje permanente.\n• Lunares o tatuajes.\n• Epilepsia.'
    },
    {
      heading: 'POSIBLES REACCIONES ADVERSAS Y EFECTOS SECUNDARIOS',
      body: 'Todos los tratamientos médicos y de estética se hayan asociados a determinados riesgos y complicaciones. Los posibles riesgos y complicaciones asociadas a la depilación láser incluyen:\n• Aunque es muy bajo y raro, existe el riesgo de cicatrices y ampollas.\n• Efectos a corto plazo pueden incluir el enrojecimiento de la piel, ardor o irritación leve, hinchazón. moretones temporarios, hiperpigmentación (oscurecimiento de la piel) e hipopigmentación (aclarado de la piel). Estas condiciones en general se resuelven en 3 a 6 meses. El cambio permanente de color de la piel es un riesgo muy raro.\n• Infección: aunque la infección después de un tratamiento es inusual y rara, pueden ocurrir infecciones virales, bacteriales y fúngicas. La infección con Herpes Simple alrededor de la boca puede ocurrir después de un tratamiento. Este riesgo aplica tanto a individuos con y sin antecedentes de este tipo de infección en el área de la boca. Si ocurriera algún tipo de infección pueden ser necesarios tratamientos y medicamentos adicionales.\n• Foliculitis: es una infección de folículo de pelo que puede tardar varios días en resolverse.\n• Hemorragia: la aparición de puntos de sangrado es muy infrecuente pero puede llegar a ocurrir tras un tratamiento. Si ocurriese el sangrado, pueden ser necesarios tratamientos adicionales.\n• Reacciones alérgicas'
    },
    {
      heading: 'CUIDADOS PRE Y POST-TRATAMIENTO',
      body: '• Evitar la exposición al sol antes y después del tratamiento. En zonas expuestas al sol es importante utilizar pantallas protectoras solares, ya que reduce el riesgo de cambios de color de la piel.\n• No utilizar ningún tipo procedimiento de eliminación del pelo (por ej. depilación con cera, arrancado del pelo. depilación por electrólisis, etc.) 2 a 4 semanas antes del tratamiento con depilación láser. El paciente no podrá utilizar otro método para depilarse que no sea el rastrillo, ni antes del tratamiento ni después de éste, ya que de ser asi la raiz del folículo se verá afectada y su ciclo tambien.\n• Se le indicará la utilización de anteojos de protección durante el tratamiento láser, para proteger sus ojos de la luz láser. Comprendo que exponer mis ojos a la luz láser puede dañar mi visión. Debo mantener colocados los lentes protectores todo el tiempo.\n• Se recomienda utilizar un exfoliante suave ya sea en gel o jabón, para facilitar la eliminación de células muertas y vello 2 o 3 veces por semana.\n• Cinco dias después de la sesión depilar únicamente con crema depilatoria y suspender 5 días antes de la siguiente sesión. Un día antes de la sesión depilar con rastrillo.\n• Después del tratamiento se necesitan, en general, de 10 a 21 días para que un porcentaje de pelo caiga.\n• En caso de una reacción como enrojecimiento severo o ámpula, aplicar pomada antibiótica durante 5 a 8 dias para evitar una cicatriz.\nNo cumplir con las indicaciones y cuidados posteriores al tratamiento incrementa las posibilidades de sufrir riesgos y complicaciones'
    },
    {
      heading: 'DECLARACIÓN Y ACEPTACIÓN',
      body: 'Comprendo que el tratamiento de depilación láser es electivo y por lo tanto acepto libremente todos los riesgos. complicaciones y efectos secundarios que pueden resultar de este tratamiento.\nEstoy de acuerdo en realizar todas las consultas de seguimiento que me sean indicadas y en cumplir las indicaciones e instrucciones post-tratamiento.\nComprendo perfectamente y acepto que ninguna garantía me ha sido dada en lo concerniente a los resultados del tratamiento de depilación láser.\nEste consentimiento es válido para todas las futuras sesiones de depilación láser que se realicen y es mi responsabilidad dar aviso al personal de la clínica de cualquier cambio en el futuro de mi historia médica.\nEntiendo que aunque son poco frecuentes pueden presentarse efectos secundarios, y en caso de requerir tratamiento posterior, uso de otros equipos, consultas médicas o productos dermatológicos, los gastos correrán por mi cuenta, siendo solo responsabilidad de la Clínica ofrecer todas las alternativas posibles para resolverlas.\nLa información contenida en este consentimiento informado me fue explicada utilizando términos y palabras que comprendo y todas mis preguntas e inquietudes fueron respondidas. Después de revisar toda la información que me ha sido suministrada sobre el tratamiento y examinar mi estado de salud, creo ser un buen candidato para el procedimiento de depilación láser.\nAsumo la responsabilidad total de mi elección de someterme al tratamiento de depilación láser propuesto.'
    }
  ]
};

export function getConsentText(type) {
  if (type === 'laser-diodo') return CONSENT_LASER_DIODO;
  throw new Error(`Consentimiento desconocido: ${type}`);
}
```

- [ ] **Step 2: Verificar y commitear**

Run: `node --check src/services/consentTexts.js`
Expected: sin errores.

```bash
git add src/services/consentTexts.js
git commit -m "feat(expedientes): texto íntegro versionado del consentimiento láser diodo"
```

---

### Task 5: Generador de PDFs Venus (`expedientePdf.js`)

**Files:**
- Create: `src/services/expedientePdf.js`
- Create: `scripts/test-expediente-pdf.js`
- Modify: `package.json` (nueva dep `pdf-lib`)

**Interfaces:**
- Consumes: `getConsentText(type)` (Task 4).
- Produces: `buildIntakePdf(intake, card)` → `Buffer`; `buildConsentPdf(consent, card)` → `Buffer`; `buildDiagnosisPdf(diagnosis, card)` → `Buffer`. Los tres aceptan objetos Prisma tal cual.

- [ ] **Step 1: Instalar pdf-lib**

Run: `npm install pdf-lib`
Expected: agregado a package.json sin vulnerabilidades bloqueantes.

- [ ] **Step 2: Script de prueba (falla)**

Create `scripts/test-expediente-pdf.js`:

```js
// node scripts/test-expediente-pdf.js — genera PDFs de muestra en /tmp para revisión visual
import fs from 'fs';
import { buildIntakePdf, buildConsentPdf, buildDiagnosisPdf } from '../src/services/expedientePdf.js';

const card = { name: 'Clienta De Prueba', phone: '524271234567' };
const intake = {
  status: 'signed', fullName: 'Clienta De Prueba', birthDate: '31-Enero-1995', age: 30,
  phone: '4271234567', profession: 'Enfermera', address: 'Av. Ejemplo 123', socialMedia: '@ejemplo',
  referralSource: 'Instagram',
  interestData: {
    cicloMenstrual: 'R',
    embarazo: { value: false }, lactancia: { value: false },
    alergias: { value: true, detail: 'Asmática, colágeno' },
    vitaminas: { value: true, detail: 'Colágeno' }, medicamentos: { value: false },
    implantes: { value: false }, anticonceptivos: { value: false },
    intervenciones: { value: false }, protectorSolar: { value: true, detail: 'No reaplica' },
  },
  skinCondition: 'Reseca', conditionSince: 'Desde siempre', previousTreatments: 'No',
  treatmentReactions: '',
  questionnaires: { pielSensible: { q1: 'No', q2: 'Maquillaje', q3: 'Sí (entre 12 y 3pm)', q4: 'No' } },
  routineDay: ['Protector solar', 'Crema de día'], routineNight: ['Loreal de noche retinol'],
  photoConsent: true, signedAt: new Date(),
  signatureClient: null, signatureStaff: null,
};
fs.writeFileSync('/tmp/venus-ficha.pdf', await buildIntakePdf(intake, card));
fs.writeFileSync('/tmp/venus-consent.pdf', await buildConsentPdf({ type: 'laser-diodo', signedAt: new Date(), signatureClient: null }, card));
fs.writeFileSync('/tmp/venus-diag.pdf', await buildDiagnosisPdf({ skinType: 'Grasa', alteration: 'Desvitalizada, sensibilizada, obstruida', causes: 'Una incorrecta rutina de cuidado, falta de hidratación', cosmeticTx: 'Limpieza profunda', prognosis: 'Bueno', cost: '$700', createdAt: new Date() }, card));
console.log('✅ PDFs generados en /tmp/venus-*.pdf — ábrelos y revisa el formato');
```

Run: `node scripts/test-expediente-pdf.js`
Expected: FAIL `Cannot find module '../src/services/expedientePdf.js'`

- [ ] **Step 3: Implementar**

Create `src/services/expedientePdf.js`:

```js
// src/services/expedientePdf.js
// Genera los PDFs del expediente con branding Venus (pdf-lib).
// Paleta: verde salvia #A8BFA0 (headers), tinta #243026, crema #FBF7EF.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getConsentText } from './consentTexts.js';

const SAGE = rgb(0.66, 0.75, 0.63);
const INK = rgb(0.14, 0.19, 0.15);
const MUTED = rgb(0.35, 0.40, 0.36);
const CREAM = rgb(0.984, 0.969, 0.937);

const A4 = [595.28, 841.89];
const MARGIN = 48;

// ---------- helpers ----------
function wrap(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) { lines.push(line); line = w; }
    else line = trial;
  }
  if (line) lines.push(line);
  return lines;
}

class Doc {
  constructor(pdf, fonts) { this.pdf = pdf; this.fonts = fonts; this.page = null; this.y = 0; this.newPage(); }
  newPage() { this.page = this.pdf.addPage(A4); this.y = A4[1] - MARGIN; this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: CREAM }); }
  ensure(h) { if (this.y - h < MARGIN) this.newPage(); }
  title(text) {
    this.ensure(40);
    this.page.drawText(text, { x: MARGIN, y: this.y - 24, size: 22, font: this.fonts.serif, color: INK });
    this.y -= 40;
  }
  sectionHeader(text) {
    this.ensure(30);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 20, width: A4[0] - MARGIN * 2, height: 20, color: SAGE });
    this.page.drawText(text.toUpperCase(), { x: MARGIN + 8, y: this.y - 14, size: 10, font: this.fonts.bold, color: rgb(1, 1, 1) });
    this.y -= 30;
  }
  field(label, value) {
    const text = `${label}: ${value ?? '—'}`;
    for (const line of wrap(text, this.fonts.sans, 10, A4[0] - MARGIN * 2)) {
      this.ensure(14);
      this.page.drawText(line, { x: MARGIN, y: this.y - 10, size: 10, font: this.fonts.sans, color: INK });
      this.y -= 14;
    }
    this.y -= 2;
  }
  paragraph(text, size = 9) {
    for (const raw of String(text || '').split('\n')) {
      for (const line of wrap(raw, this.fonts.sans, size, A4[0] - MARGIN * 2)) {
        this.ensure(size + 4);
        this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font: this.fonts.sans, color: MUTED });
        this.y -= size + 3;
      }
      this.y -= 3;
    }
  }
  async signature(label, dataUrl, signedAt) {
    this.ensure(90);
    if (dataUrl?.startsWith('data:image/png;base64,')) {
      const png = await this.pdf.embedPng(Buffer.from(dataUrl.split(',')[1], 'base64'));
      const dims = png.scaleToFit(180, 60);
      this.page.drawImage(png, { x: MARGIN, y: this.y - 65, width: dims.width, height: dims.height });
    }
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 70 }, end: { x: MARGIN + 200, y: this.y - 70 }, thickness: 0.8, color: INK });
    const when = signedAt ? new Date(signedAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }) : '';
    this.page.drawText(`${label}${when ? ' — ' + when : ''}`, { x: MARGIN, y: this.y - 82, size: 8, font: this.fonts.sans, color: MUTED });
    this.y -= 95;
  }
}

async function newDoc() {
  const pdf = await PDFDocument.create();
  const fonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  return new Doc(pdf, fonts);
}

const YESNO = (e) => (e == null ? '—' : e.value ? `Sí${e.detail ? ` (${e.detail})` : ''}` : 'No');

const INTEREST_LABELS = {
  cicloMenstrual: 'Ciclo menstrual', embarazo: 'Embarazo', lactancia: 'Lactancia',
  alergias: 'Alergias', vitaminas: 'Vitaminas / Suplementos', medicamentos: 'Medicamentos',
  implantes: 'Implantes o dispositivos', anticonceptivos: 'Anticonceptivos',
  intervenciones: 'Intervenciones estéticas o quirúrgicas', protectorSolar: 'Protector solar',
};

const QUESTIONNAIRE_TITLES = {
  acne: 'Acné', cicatrices: 'Cicatrices atróficas', pigmentaciones: 'Pigmentaciones',
  envejecimiento: 'Envejecimiento', ojerasInflamadas: 'Ojeras inflamadas',
  ojerasPigmentadas: 'Ojeras pigmentadas', pielSensible: 'Piel sensible',
};

// Preguntas oficiales (transcritas del formato): clave = id de condición, valor = array en orden q1..qN
export const QUESTIONNAIRES = {
  acne: [
    '¿Cómo es tu ingesta de lácteos, embutidos, azúcares y/o comida chatarra?',
    '¿Utilizas base de maquillaje todos los días?',
    '¿Con qué frecuencia lavas tus brochas?',
    '¿Compartes tu maquillaje con amigos o familiares?',
    '¿Con qué te desmaquillas el rostro?',
    '¿Con qué frecuencia cambias las fundas de tus almohadas?',
    '¿Cómo es tu nivel de estrés?',
    '¿Tiendes a manipular, pellizcar o rascar las lesiones del acné?',
  ],
  cicatrices: [
    '¿Padeciste acné en alguna etapa de tu vida? ¿Cuánto tiempo?',
    '¿Presentaban inflamación o lesiones muy grandes?',
    '¿Cómo trataste tu acné?',
    '¿Manipulabas, pellizcabas o rascabas tus lesiones?',
  ],
  pigmentaciones: [
    '¿Cuánto tiempo llevas con la pigmentación en tu piel?',
    '¿Te expones mucho tiempo al sol?',
    'Describe el ambiente climático en el que te encuentras en tu trabajo',
    '¿Pasas mucho tiempo frente a la radiación de luz azul?',
    '¿Tomas o has tomado medicamentos que puedan sensibilizar tu piel?',
  ],
  envejecimiento: [
    '¿Cuánto tiempo tienes usando protector solar?',
    '¿A partir de qué edad empezaste a cuidar tu piel?',
    '¿En qué posición duermes?',
    '¿Fumas?',
    '¿Te expones mucho al sol? ¿Cuánto?',
  ],
  ojerasInflamadas: [
    '¿Ingieres alimentos muy condimentados y con mucha sal?',
    '¿Cómo es la calidad de tu sueño al dormir?',
    '¿Tu familia tiene o presenta inflamación en el contorno de ojos?',
  ],
  ojerasPigmentadas: [
    '¿Cómo es tu técnica de desmaquillado?',
    '¿Frotas constantemente tus ojos?',
    '¿Cuántas horas estás durmiendo por las noches? ¿Y a qué hora te duermes?',
    '¿Tu familia tiene o presenta pigmentación en las ojeras?',
    '¿Presentas alguna alergia que afecte tus ojos?',
  ],
  pielSensible: [
    '¿Recientemente te has realizado algún tratamiento invasivo? ¿Cuál?',
    '¿Tu piel no tolera muy bien todos los productos para la piel?',
    '¿Normalmente tu piel tiene una temperatura alta?',
    '¿En tu familia hay enfermedades o condiciones de la piel como piel sensible, reactiva, con cáncer de piel o rosácea?',
  ],
};

export async function buildIntakePdf(intake, card) {
  const d = await newDoc();
  d.title('FICHA CLÍNICA — VENUS');
  d.sectionHeader('Datos personales');
  d.field('Nombre completo', intake.fullName || card.name);
  d.field('Fecha de nacimiento', intake.birthDate);
  d.field('Edad', intake.age);
  d.field('Teléfono', intake.phone || card.phone);
  d.field('Profesión', intake.profession);
  d.field('Dirección', intake.address);
  d.field('Redes sociales', intake.socialMedia);
  d.field('Medio por el cual se enteró de nosotros', intake.referralSource);

  d.sectionHeader('Datos de interés');
  const i = intake.interestData || {};
  d.field('Ciclo menstrual (R / IR / NP)', i.cicloMenstrual);
  for (const k of ['embarazo','lactancia','alergias','vitaminas','medicamentos','implantes','anticonceptivos','intervenciones','protectorSolar']) {
    d.field(INTEREST_LABELS[k], YESNO(i[k]));
  }

  d.sectionHeader('Condiciones, padecimientos y enfermedades de la piel');
  d.field('Condición de la piel que se busca mejorar', intake.skinCondition);
  d.field('Desde cuándo se padece la condición', intake.conditionSince);
  d.field('Tratamientos realizados anteriormente', intake.previousTreatments);
  d.field('Reacciones positivas o negativas después del tratamiento', intake.treatmentReactions);

  const qs = intake.questionnaires || {};
  for (const [key, answers] of Object.entries(qs)) {
    if (!answers || !QUESTIONNAIRES[key]) continue;
    d.sectionHeader(QUESTIONNAIRE_TITLES[key] || key);
    QUESTIONNAIRES[key].forEach((question, idx) => {
      d.field(`${idx + 1}. ${question}`, answers[`q${idx + 1}`]);
    });
  }

  d.sectionHeader('Rutina skincare');
  d.field('Día', (intake.routineDay || []).join(' · ') || '—');
  d.field('Noche', (intake.routineNight || []).join(' · ') || '—');

  d.sectionHeader('Autorización de fotografías');
  d.paragraph('DECLARO QUE TODA LA INFORMACIÓN DADA ANTERIORMENTE ES VERÍDICA. Y AUTORIZO QUE CONSULTORIO COSMETOLÓGICO VENUS TOME FOTOGRAFÍAS CONFIDENCIALES DE MI PROCEDIMIENTO ESTÉTICO CON EL ÚNICO FIN DE OBSERVAR LOS RESULTADOS Y EL AVANCE DE MI TRATAMIENTO. En caso de que CONSULTORIO COSMETOLÓGICO VENUS tenga la intención de publicar las fotos como evidencia de un buen resultado, tendrá la obligación de pedirle autorización previa al paciente para dicha publicación; en caso de ser así se mantendrá en todo momento la confidencialidad del paciente.');
  d.field('Autorización', intake.photoConsent === true ? 'SÍ AUTORIZO' : intake.photoConsent === false ? 'NO AUTORIZO' : '—');

  await d.signature('Firma del paciente', intake.signatureClient, intake.signedAt);
  if (intake.signatureStaff) await d.signature('Firma cosmetóloga', intake.signatureStaff, intake.signedAt);
  return Buffer.from(await d.pdf.save());
}

export async function buildConsentPdf(consent, card) {
  const d = await newDoc();
  const text = getConsentText(consent.type || 'laser-diodo');
  d.title('CONSENTIMIENTO INFORMADO — VENUS');
  d.field('Paciente', card.name);
  d.field('Teléfono', card.phone);
  d.field('Documento', text.title);
  d.field('Versión del texto', consent.textVersion || text.version);
  for (const s of text.sections) {
    if (s.heading) d.sectionHeader(s.heading);
    d.paragraph(s.body);
  }
  await d.signature('Firma del paciente', consent.signatureClient, consent.signedAt);
  return Buffer.from(await d.pdf.save());
}

export async function buildDiagnosisPdf(diag, card) {
  const d = await newDoc();
  d.title('DIAGNÓSTICO FACIAL — VENUS');
  d.sectionHeader('Paciente');
  d.field('Nombre', card.name);
  d.field('Fecha', diag.createdAt ? new Date(diag.createdAt).toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—');
  d.sectionHeader('Diagnóstico');
  d.field('Tipo de piel', diag.skinType);
  d.field('Alteración y/o condición de piel', diag.alteration);
  d.field('Causas', diag.causes);
  d.field('TX cosmético', diag.cosmeticTx);
  d.field('Pronóstico', diag.prognosis);
  d.field('Costo', diag.cost);
  if (diag.staffName) d.field('Cosmetóloga', diag.staffName);
  return Buffer.from(await d.pdf.save());
}
```

- [ ] **Step 4: Verificar visualmente**

Run: `node --check src/services/expedientePdf.js && node scripts/test-expediente-pdf.js`
Expected: `✅ PDFs generados en /tmp/venus-*.pdf`. Abrir los 3 PDFs (`open /tmp/venus-ficha.pdf` etc.) y confirmar: header salvia por sección, todos los campos presentes, texto legal completo en el consentimiento, sin texto encimado ni cortado.

- [ ] **Step 5: Commit**

```bash
git add src/services/expedientePdf.js scripts/test-expediente-pdf.js package.json package-lock.json
git commit -m "feat(expedientes): generación de PDFs Venus (ficha, consentimiento, diagnóstico) con pdf-lib"
```

---

### Task 6: Router `/api/expedientes` (público con token + admin)

**Files:**
- Create: `src/routes/expedientes.js`
- Modify: `server.js` (2 líneas: import + mount, junto a `clientRecordsRouter`)

**Interfaces:**
- Consumes: Tasks 1-5 (`prisma`, `signFichaToken/verifyFichaToken`, `ensureClientFolder/uploadBuffer/isDriveConfigured`, `buildIntakePdf/buildConsentPdf/buildDiagnosisPdf`, `getConsentText`), `adminAuth` de `lib/auth.js`, `NotificationsRepo` de `src/db/repositories.js`, `WhatsAppService` (los métodos de envío de link se crean en Task 7 — este router los llama; implementar Task 7 antes de probar los endpoints `send-*`).
- Produces (público, sin auth, token en URL):
  - `GET  /api/expedientes/public/ficha/:token` → `{ card:{name,phone}, intake }` (crea ClientRecord+IntakeForm draft si no existen)
  - `PUT  /api/expedientes/public/ficha/:token` → guarda borrador (body = campos parciales)
  - `POST /api/expedientes/public/ficha/:token/submit` → firma, PDF, Drive, notificación
  - `GET  /api/expedientes/public/consent/:token` → `{ card, consentText, consent }`
  - `POST /api/expedientes/public/consent/:token/submit` → firma, PDF, Drive, notificación
- Produces (admin, `adminAuth`):
  - `GET    /api/expedientes/:cardId` → expediente completo (intake+consents+diagnoses+laserSessions+documents)
  - `POST   /api/expedientes/:cardId/send-ficha` / `send-consent` → genera token, manda WhatsApp, marca `fichaLinkSentAt`
  - `PUT    /api/expedientes/:cardId/diagnosis` (upsert del más reciente) y `POST .../diagnosis/pdf` (genera PDF→Drive)
  - `POST/PUT/DELETE /api/expedientes/:cardId/laser-sessions[/:id]`
  - `POST   /api/expedientes/:cardId/documents` (multer `files`, hasta 10) / `GET .../documents` / `DELETE .../documents/:docId`

- [ ] **Step 1: Implementar el router**

Create `src/routes/expedientes.js`:

```js
// src/routes/expedientes.js
// Expedientes digitales: formularios públicos por token + gestión desde el admin.
import express from 'express';
import multer from 'multer';
import { prisma } from '../db/index.js';
import { adminAuth } from '../../lib/auth.js';
import { NotificationsRepo } from '../db/repositories.js';
import { signFichaToken, verifyFichaToken } from '../services/fichaTokens.js';
import { ensureClientFolder, uploadBuffer, isDriveConfigured } from '../services/driveService.js';
import { buildIntakePdf, buildConsentPdf, buildDiagnosisPdf } from '../services/expedientePdf.js';
import { getConsentText } from '../services/consentTexts.js';
import { WhatsAppService } from '../services/whatsapp-v2.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const fail = (res, code, msg) => res.status(code).json({ success: false, error: msg });

async function ensureRecord(cardId) {
  let record = await prisma.clientRecord.findUnique({ where: { cardId } });
  if (!record) record = await prisma.clientRecord.create({ data: { cardId } });
  return record;
}

async function cardFromToken(token, purpose) {
  const { cardId } = verifyFichaToken(token, purpose); // lanza si inválido
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw new Error('card_not_found');
  return card;
}

// Sube PDF a Drive y regresa campos para persistir; si Drive falla o no está
// configurado, marca pending para que el cron lo reintente.
async function pushPdfToDrive(card, filename, buffer) {
  if (!isDriveConfigured()) return { pdfDriveFileId: null, pdfWebViewLink: null, driveUploadPending: true };
  try {
    const folderId = await ensureClientFolder(card);
    const up = await uploadBuffer({ folderId, name: filename, mimeType: 'application/pdf', buffer });
    return { pdfDriveFileId: up.id, pdfWebViewLink: up.webViewLink, driveUploadPending: false };
  } catch (e) {
    console.error('[expedientes] Drive falló, queda pendiente:', e.message);
    return { pdfDriveFileId: null, pdfWebViewLink: null, driveUploadPending: true };
  }
}

const fechaHoy = () => new Date().toISOString().slice(0, 10);

/* ================= PÚBLICO (token) ================= */

router.get('/public/ficha/:token', async (req, res) => {
  try {
    const card = await cardFromToken(req.params.token, 'ficha');
    const record = await ensureRecord(card.id);
    let intake = await prisma.intakeForm.findUnique({ where: { recordId: record.id } });
    if (!intake) intake = await prisma.intakeForm.create({ data: { recordId: record.id, fullName: card.name, phone: card.phone } });
    const { signatureClient, signatureStaff, ...safe } = intake;
    res.json({ success: true, card: { name: card.name, phone: card.phone }, intake: safe });
  } catch (e) { return fail(res, 401, 'link_invalido_o_expirado'); }
});

router.put('/public/ficha/:token', async (req, res) => {
  try {
    const card = await cardFromToken(req.params.token, 'ficha');
    const record = await ensureRecord(card.id);
    const intake = await prisma.intakeForm.findUnique({ where: { recordId: record.id } });
    if (!intake) return fail(res, 404, 'ficha_no_iniciada');
    if (intake.status === 'signed') return fail(res, 409, 'ficha_ya_firmada');
    const allowed = ['fullName','birthDate','age','phone','profession','address','socialMedia','referralSource',
      'interestData','skinCondition','conditionSince','previousTreatments','treatmentReactions',
      'questionnaires','routineDay','routineNight','photoConsent'];
    const data = {};
    for (const k of allowed) if (k in req.body) data[k] = req.body[k];
    if ('age' in data && data.age != null) data.age = parseInt(data.age, 10) || null;
    await prisma.intakeForm.update({ where: { id: intake.id }, data });
    res.json({ success: true });
  } catch (e) { return fail(res, 401, 'link_invalido_o_expirado'); }
});

router.post('/public/ficha/:token/submit', async (req, res) => {
  try {
    const card = await cardFromToken(req.params.token, 'ficha');
    const record = await ensureRecord(card.id);
    const intake = await prisma.intakeForm.findUnique({ where: { recordId: record.id } });
    if (!intake) return fail(res, 404, 'ficha_no_iniciada');
    if (intake.status === 'signed') return fail(res, 409, 'ficha_ya_firmada');
    const { signature } = req.body || {};
    if (!signature?.startsWith('data:image/png;base64,')) return fail(res, 400, 'firma_requerida');

    const signed = await prisma.intakeForm.update({
      where: { id: intake.id },
      data: { status: 'signed', signatureClient: signature, signedAt: new Date() },
    });

    const pdf = await buildIntakePdf(signed, card);
    const drive = await pushPdfToDrive(card, `Ficha Clínica – ${fechaHoy()}.pdf`, pdf);
    await prisma.intakeForm.update({ where: { id: intake.id }, data: drive });
    if (drive.pdfDriveFileId) {
      await prisma.clientDocument.create({ data: { recordId: record.id, name: `Ficha Clínica – ${fechaHoy()}.pdf`, mimeType: 'application/pdf', driveFileId: drive.pdfDriveFileId, webViewLink: drive.pdfWebViewLink, source: 'generated' } });
    }

    // Denormalizar resumen que el admin ya muestra
    const alergias = signed.interestData?.alergias;
    await prisma.clientRecord.update({
      where: { id: record.id },
      data: {
        age: signed.age ?? undefined,
        allergies: alergias?.value ? (alergias.detail || 'Sí') : alergias ? 'No' : undefined,
      },
    });

    await NotificationsRepo.create({ type: 'cliente', icon: 'clipboard-check', title: 'Ficha clínica completada', message: `${card.name} completó y firmó su ficha clínica`, read: false, entityId: card.id });
    res.json({ success: true });
  } catch (e) {
    console.error('[expedientes] submit ficha:', e);
    return fail(res, 401, 'link_invalido_o_expirado');
  }
});

router.get('/public/consent/:token', async (req, res) => {
  try {
    const card = await cardFromToken(req.params.token, 'consent');
    const record = await ensureRecord(card.id);
    const consent = await prisma.consentDoc.findFirst({ where: { recordId: record.id, type: 'laser-diodo' }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, card: { name: card.name }, consentText: getConsentText('laser-diodo'), consent: consent ? { status: consent.status, signedAt: consent.signedAt } : null });
  } catch (e) { return fail(res, 401, 'link_invalido_o_expirado'); }
});

router.post('/public/consent/:token/submit', async (req, res) => {
  try {
    const card = await cardFromToken(req.params.token, 'consent');
    const record = await ensureRecord(card.id);
    const { signature } = req.body || {};
    if (!signature?.startsWith('data:image/png;base64,')) return fail(res, 400, 'firma_requerida');
    const existing = await prisma.consentDoc.findFirst({ where: { recordId: record.id, type: 'laser-diodo', status: 'signed' } });
    if (existing) return fail(res, 409, 'consentimiento_ya_firmado');

    const text = getConsentText('laser-diodo');
    const consent = await prisma.consentDoc.create({ data: { recordId: record.id, type: 'laser-diodo', textVersion: text.version, status: 'signed', signatureClient: signature, signedAt: new Date() } });
    const pdf = await buildConsentPdf(consent, card);
    const drive = await pushPdfToDrive(card, `Consentimiento Láser – ${fechaHoy()}.pdf`, pdf);
    await prisma.consentDoc.update({ where: { id: consent.id }, data: drive });
    if (drive.pdfDriveFileId) {
      await prisma.clientDocument.create({ data: { recordId: record.id, name: `Consentimiento Láser – ${fechaHoy()}.pdf`, mimeType: 'application/pdf', driveFileId: drive.pdfDriveFileId, webViewLink: drive.pdfWebViewLink, source: 'generated' } });
    }
    await NotificationsRepo.create({ type: 'cliente', icon: 'file-signature', title: 'Consentimiento firmado', message: `${card.name} firmó el consentimiento de depilación láser`, read: false, entityId: card.id });
    res.json({ success: true });
  } catch (e) {
    console.error('[expedientes] submit consent:', e);
    return fail(res, 401, 'link_invalido_o_expirado');
  }
});

/* ================= ADMIN ================= */

router.use(adminAuth);

router.get('/:cardId', async (req, res) => {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    if (!card) return fail(res, 404, 'card_not_found');
    const record = await ensureRecord(card.id);
    const [intake, consents, diagnoses, laserSessions, documents] = await Promise.all([
      prisma.intakeForm.findUnique({ where: { recordId: record.id } }),
      prisma.consentDoc.findMany({ where: { recordId: record.id }, orderBy: { createdAt: 'desc' } }),
      prisma.facialDiagnosis.findMany({ where: { recordId: record.id }, orderBy: { createdAt: 'desc' } }),
      prisma.laserSessionLog.findMany({ where: { recordId: record.id }, orderBy: { date: 'desc' } }),
      prisma.clientDocument.findMany({ where: { recordId: record.id }, orderBy: { uploadedAt: 'desc' } }),
    ]);
    res.json({ success: true, record: { id: record.id, fichaLinkSentAt: record.fichaLinkSentAt }, intake, consents, diagnoses, laserSessions, documents });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

async function sendLink(req, res, purpose) {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    if (!card) return fail(res, 404, 'card_not_found');
    if (!card.phone) return fail(res, 400, 'clienta_sin_telefono');
    const record = await ensureRecord(card.id);
    const token = signFichaToken(card.id, purpose);
    const base = process.env.BASE_URL || 'https://venuscosmetologia.com.mx';
    const url = purpose === 'ficha' ? `${base}/ficha/${token}` : `${base}/consentimiento/${token}`;
    if (purpose === 'ficha') await WhatsAppService.sendFichaClinicaLink(card, url);
    else await WhatsAppService.sendConsentimientoLink(card, url);
    await prisma.clientRecord.update({ where: { id: record.id }, data: { fichaLinkSentAt: new Date() } });
    res.json({ success: true, url });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
}
router.post('/:cardId/send-ficha', (req, res) => sendLink(req, res, 'ficha'));
router.post('/:cardId/send-consent', (req, res) => sendLink(req, res, 'consent'));

router.put('/:cardId/diagnosis', async (req, res) => {
  try {
    const record = await ensureRecord(req.params.cardId);
    const { id, skinType, alteration, causes, cosmeticTx, prognosis, cost, staffName } = req.body || {};
    const data = { skinType, alteration, causes, cosmeticTx, prognosis, cost, staffName };
    const diag = id
      ? await prisma.facialDiagnosis.update({ where: { id }, data })
      : await prisma.facialDiagnosis.create({ data: { recordId: record.id, ...data } });
    res.json({ success: true, diagnosis: diag });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.post('/:cardId/diagnosis/:id/pdf', async (req, res) => {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    const record = await ensureRecord(card.id);
    const diag = await prisma.facialDiagnosis.findUnique({ where: { id: req.params.id } });
    if (!diag || diag.recordId !== record.id) return fail(res, 404, 'diagnostico_no_encontrado');
    const pdf = await buildDiagnosisPdf(diag, card);
    const drive = await pushPdfToDrive(card, `Diagnóstico Facial – ${fechaHoy()}.pdf`, pdf);
    await prisma.facialDiagnosis.update({ where: { id: diag.id }, data: { pdfDriveFileId: drive.pdfDriveFileId, pdfWebViewLink: drive.pdfWebViewLink } });
    if (drive.pdfDriveFileId) {
      await prisma.clientDocument.create({ data: { recordId: record.id, name: `Diagnóstico Facial – ${fechaHoy()}.pdf`, mimeType: 'application/pdf', driveFileId: drive.pdfDriveFileId, webViewLink: drive.pdfWebViewLink, source: 'generated' } });
    }
    res.json({ success: true, webViewLink: drive.pdfWebViewLink, pending: drive.driveUploadPending });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.post('/:cardId/laser-sessions', async (req, res) => {
  try {
    const record = await ensureRecord(req.params.cardId);
    const { date, staffName, zone, frequency, fluence, laserIntensity, observations } = req.body || {};
    const session = await prisma.laserSessionLog.create({ data: { recordId: record.id, date: date ? new Date(date) : new Date(), staffName, zone, frequency, fluence, laserIntensity, observations } });
    res.json({ success: true, session });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.put('/:cardId/laser-sessions/:id', async (req, res) => {
  try {
    const { date, staffName, zone, frequency, fluence, laserIntensity, observations } = req.body || {};
    const session = await prisma.laserSessionLog.update({ where: { id: req.params.id }, data: { date: date ? new Date(date) : undefined, staffName, zone, frequency, fluence, laserIntensity, observations } });
    res.json({ success: true, session });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.delete('/:cardId/laser-sessions/:id', async (req, res) => {
  try { await prisma.laserSessionLog.delete({ where: { id: req.params.id } }); res.json({ success: true }); }
  catch (e) { return fail(res, 500, e.message); }
});

router.post('/:cardId/documents', upload.array('files', 10), async (req, res) => {
  try {
    const card = await prisma.card.findUnique({ where: { id: req.params.cardId } });
    if (!card) return fail(res, 404, 'card_not_found');
    if (!isDriveConfigured()) return fail(res, 503, 'drive_no_configurado');
    const record = await ensureRecord(card.id);
    const folderId = await ensureClientFolder(card);
    const saved = [];
    for (const f of req.files || []) {
      const up = await uploadBuffer({ folderId, name: f.originalname, mimeType: f.mimetype, buffer: f.buffer });
      saved.push(await prisma.clientDocument.create({ data: { recordId: record.id, name: f.originalname, mimeType: f.mimetype, driveFileId: up.id, webViewLink: up.webViewLink, source: 'scan-import', sizeBytes: f.size } }));
    }
    res.json({ success: true, documents: saved });
  } catch (e) { console.error(e); return fail(res, 500, e.message); }
});

router.delete('/:cardId/documents/:docId', async (req, res) => {
  try { await prisma.clientDocument.delete({ where: { id: req.params.docId } }); res.json({ success: true }); }
  catch (e) { return fail(res, 500, e.message); }
});

export default router;
```

> Nota: `ensureRecord` recibe `cardId` en los endpoints admin — el parámetro de la ruta es SIEMPRE el `card.id` (mismo identificador que usa el modal actual), no `record.id`.

- [ ] **Step 2: Montarlo en server.js**

En `server.js`, localizar (grep) `import clientRecordsRouter from './src/routes/clientRecords.js';` y agregar debajo:

```js
import expedientesRouter from './src/routes/expedientes.js';
```

Localizar `app.use('/api/client-records', clientRecordsRouter);` y agregar debajo:

```js
// 📋 Expedientes digitales (fichas, consentimientos, diagnóstico, láser, documentos Drive)
app.use('/api/expedientes', expedientesRouter);
```

- [ ] **Step 3: Verificar**

Run: `node --check src/routes/expedientes.js && node --check server.js`
Expected: sin errores.

Run (con el server local levantado `npm run dev` y `.env` presente):
```bash
curl -s localhost:3000/api/expedientes/public/ficha/token-basura | head -c 200
```
Expected: `{"success":false,"error":"link_invalido_o_expirado"}` (HTTP 401).

- [ ] **Step 4: Commit**

```bash
git add src/routes/expedientes.js server.js
git commit -m "feat(expedientes): router público por token + endpoints admin"
```

---

### Task 7: Plantillas WhatsApp + hook de primera cita

**Files:**
- Modify: `src/services/whatsapp-v2.js` (2 métodos nuevos dentro de `WhatsAppService`)
- Modify: `server.js` (helper + 2 hooks tras `sendConfirmation`)

**Interfaces:**
- Produces: `WhatsAppService.sendFichaClinicaLink(card, url)`, `WhatsAppService.sendConsentimientoLink(card, url)`, y helper global `maybeSendFichaLink(appointment)` en server.js.

- [ ] **Step 1: Agregar plantillas a whatsapp-v2.js**

En `src/services/whatsapp-v2.js`, dentro del objeto `WhatsAppService` (después de `sendConfirmacionRecibida`, localizar con grep), agregar:

```js
    /** Link para que la clienta llene su Ficha Clínica desde el celular */
    async sendFichaClinicaLink(card, url) {
        const nombre = sanitizeForWhatsApp(card.name || 'bonita');
        const mensaje = `🌸 Hola ${nombre}, para darte una atención más personalizada en *Venus Cosmetología* te pedimos llenar tu *Ficha Clínica* digital (te toma ~3 minutos):\n\n${url}\n\nTus datos son confidenciales y solo los usamos para cuidar tu piel. ✨`;
        return await sendViaEvolution(card.phone, mensaje);
    },

    /** Link para firmar el consentimiento informado de depilación láser */
    async sendConsentimientoLink(card, url) {
        const nombre = sanitizeForWhatsApp(card.name || 'bonita');
        const mensaje = `📋 Hola ${nombre}, antes de tu sesión de *depilación láser* necesitamos que leas y firmes el *consentimiento informado*:\n\n${url}\n\nCualquier duda, respóndenos por aquí. 🌸`;
        return await sendViaEvolution(card.phone, mensaje);
    },
```

(Si `sanitizeForWhatsApp` o `sendViaEvolution` tienen otro nombre en el archivo, usar el que usan los métodos vecinos — copiar el patrón exacto de `sendConfirmacionRecibida`.)

- [ ] **Step 2: Hook de primera cita en server.js**

Agregar cerca de los helpers de server.js (después de los imports, localizar con grep la línea `import expedientesRouter`):

```js
// Si la clienta aún no tiene ficha clínica firmada (y no le hemos mandado el link
// en los últimos 7 días), enviarle el link al confirmar su cita.
async function maybeSendFichaLink(appointment) {
  try {
    if (!appointment?.clientPhone) return;
    const card = await CardsRepo.findByPhone(appointment.clientPhone);
    if (!card) return;
    const record = await prismaClient.clientRecord.findUnique({ where: { cardId: card.id }, include: { intake: true } });
    if (record?.intake?.status === 'signed') return;
    const last = record?.fichaLinkSentAt ? Date.now() - new Date(record.fichaLinkSentAt).getTime() : Infinity;
    if (last < 7 * 24 * 60 * 60 * 1000) return;
    const { signFichaToken } = await import('./src/services/fichaTokens.js');
    const token = signFichaToken(card.id, 'ficha');
    const base = process.env.BASE_URL || 'https://venuscosmetologia.com.mx';
    await WhatsAppService.sendFichaClinicaLink(card, `${base}/ficha/${token}`);
    const rec = record ?? await prismaClient.clientRecord.create({ data: { cardId: card.id } });
    await prismaClient.clientRecord.update({ where: { id: rec.id }, data: { fichaLinkSentAt: new Date() } });
    console.log(`📋 [ficha] Link de ficha enviado a ${card.name}`);
  } catch (e) { console.warn('[ficha] no se pudo enviar link:', e.message); }
}
```

> `prismaClient`: usar el identificador con el que server.js ya importa Prisma (grep `from './src/db/index.js'` — si importa `{ prisma }`, usar `prisma`). `CardsRepo` ya está importado en server.js.

Localizar con `grep -n "WhatsAppService.sendConfirmation(appointment" server.js` los DOS sitios donde se envía la confirmación de una cita recién creada (≈1629 y ≈4739) y justo después de cada llamada (misma zona try/catch) agregar:

```js
    maybeSendFichaLink(appointment); // fire-and-forget: no bloquear la respuesta
```

- [ ] **Step 3: Verificar**

Run: `node --check src/services/whatsapp-v2.js && node --check server.js`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/services/whatsapp-v2.js server.js
git commit -m "feat(expedientes): plantillas WhatsApp de ficha/consentimiento + envío automático en primera cita"
```

---

### Task 8: Página pública Ficha Clínica (`public/ficha-clinica.html`)

**Files:**
- Create: `public/ficha-clinica.html`
- Modify: `server.js` (ruta `GET /ficha/:token`)

**Interfaces:**
- Consumes: `GET/PUT/POST /api/expedientes/public/ficha/:token[...]` (Task 6). El token lo lee del path (`location.pathname.split('/')[2]`).

- [ ] **Step 1: Ruta en server.js**

Localizar en `server.js` el bloque de rutas HTML (`grep -n "sendFile" server.js`, zona ~2342 donde se sirve `admin.html`) y agregar:

```js
app.get('/ficha/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ficha-clinica.html'));
});
app.get('/consentimiento/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'consentimiento-laser.html'));
});
```

- [ ] **Step 2: Crear la página**

Create `public/ficha-clinica.html` — página mobile-first autónoma. Requisitos concretos (implementar TODOS):

- `<head>`: viewport mobile, fuentes Google `Prata` + `Manrope` (mismas del sitio), favicon `/assets/logo.png`.
- Paleta CSS (variables): `--sage:#a8bfa0; --ink:#243026; --cream:#fbf7ef; --linen:#f3ecdf;` — fondo crema, tarjetas blancas radius 16px, botones pill verde salvia (copiar la estética de `public/agendar.html`; revisarla antes de escribir CSS).
- **Wizard de 7 pasos** con barra de progreso ("Paso X de 7"), botones Atrás/Siguiente, estado en un objeto JS `state` que replica la estructura de `IntakeForm`:
  1. **Tus datos** — nombre (precargado), fecha de nacimiento, edad, teléfono (precargado), profesión, dirección, redes sociales, "¿cómo te enteraste de nosotros?".
  2. **Datos de interés** — ciclo menstrual (radio R / IR / NP) + 9 toggles Sí/No (embarazo, lactancia, alergias, vitaminas/suplementos, medicamentos, implantes o dispositivos, anticonceptivos, intervenciones estéticas o quirúrgicas, protector solar); al marcar Sí en alergias/vitaminas/medicamentos/implantes/intervenciones/protector solar aparece input de detalle.
  3. **Tu piel** — condición que buscas mejorar (texto), desde cuándo, tratamientos anteriores, reacciones tras tratamientos.
  4. **Cuestionario** — multiselección de condiciones aplicables (chips: Acné, Cicatrices atróficas, Pigmentaciones, Envejecimiento, Ojeras inflamadas, Ojeras pigmentadas, Piel sensible); por cada chip elegida se muestran SOLO sus preguntas (usar el objeto `QUESTIONNAIRES` con los textos EXACTOS de Task 5 — copiarlo a un `const` del HTML; las respuestas van a `state.questionnaires[condId] = {q1:..., q2:...}`).
  5. **Tu rutina** — dos listas dinámicas (Día / Noche): input + botón "+" para agregar productos, tap para borrar.
  6. **Autorización de fotos** — el texto legal íntegro de autorización (mismo de Task 5 Step 3, sección Autorización) + dos radios grandes: "SÍ AUTORIZO" / "NO AUTORIZO".
  7. **Firma** — canvas de firma con `signature_pad` CDN `https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js`, botón "Limpiar", y botón principal "Firmar y enviar ✨".
- **Carga inicial**: `GET /api/expedientes/public/ficha/{token}`; si 401 → pantalla "Este link ya no es válido, pídenos uno nuevo por WhatsApp 🌸". Si `intake.status === 'signed'` → pantalla "✅ Tu ficha ya está completa, ¡gracias!". Si hay borrador → precargar `state` con lo guardado.
- **Autoguardado**: `PUT` con el `state` completo (debounce 800ms tras cualquier cambio y al cambiar de paso); indicador discreto "Guardado ✓".
- **Envío**: valida firma no vacía y `photoConsent != null` → `POST .../submit` con `{ ...state, signature: signaturePad.toDataURL('image/png') }`... **IMPORTANTE**: el submit del backend solo toma `signature`; el resto del estado debe estar ya persistido vía PUT — hacer un último `await PUT` antes del POST.
- **Éxito**: pantalla de gracias con logo y botón "Ir al sitio de Venus" → `/`.
- Todo el copy en español cálido; nada de texto en inglés.

- [ ] **Step 3: Verificar manualmente**

Con el server local corriendo y una Card real en la BD:

```bash
node -e "import('./src/services/fichaTokens.js').then(m=>console.log('http://localhost:3000/ficha/'+m.signFichaToken(process.argv[1],'ficha')))" <CARD_ID_REAL>
```

Abrir el link en el navegador con viewport móvil (DevTools): completar los 7 pasos, verificar autoguardado (recargar a mitad → datos persisten), firmar y enviar. Expected: pantalla de éxito; en BD `intake_forms.status='signed'`; si Drive está configurado, PDF en la carpeta de la clienta; notificación visible en el admin.

- [ ] **Step 4: Commit**

```bash
git add public/ficha-clinica.html server.js
git commit -m "feat(expedientes): página pública móvil de Ficha Clínica con firma y autoguardado"
```

---

### Task 9: Página pública Consentimiento láser (`public/consentimiento-laser.html`)

**Files:**
- Create: `public/consentimiento-laser.html`

**Interfaces:**
- Consumes: `GET/POST /api/expedientes/public/consent/:token[...]` (Task 6). La ruta HTML ya quedó montada en Task 8.

- [ ] **Step 1: Crear la página**

Mismo look & feel que `ficha-clinica.html` (reusar CSS copiándolo — son páginas autónomas). Estructura:

- Carga `GET /api/expedientes/public/consent/{token}` → render de `consentText.title` + todas las `sections` (heading en verde salvia, body respetando saltos `\n`).
- Si `consent?.status === 'signed'` → pantalla "✅ Ya firmaste este consentimiento".
- Checkbox obligatorio al final: "He leído y comprendo toda la información anterior".
- Canvas de firma (signature_pad, mismo CDN) + "Limpiar" + botón "Firmar consentimiento".
- `POST .../submit` con `{ signature }` → pantalla de éxito.
- Manejo de 401 igual que la ficha.

- [ ] **Step 2: Verificar manualmente**

```bash
node -e "import('./src/services/fichaTokens.js').then(m=>console.log('http://localhost:3000/consentimiento/'+m.signFichaToken(process.argv[1],'consent')))" <CARD_ID_REAL>
```

Abrir, leer, firmar. Expected: `consent_docs` con `status='signed'`, PDF en Drive (si configurado), notificación en admin.

- [ ] **Step 3: Commit**

```bash
git add public/consentimiento-laser.html
git commit -m "feat(expedientes): página pública de consentimiento láser con firma"
```

---

### Task 10: Admin — pestañas nuevas del modal expediente

**Files:**
- Modify: `public/admin.html` (modal `#expediente-modal`: HTML de tabs + JS)

**Interfaces:**
- Consumes: todos los endpoints admin de Task 6 (`/api/expedientes/:cardId...`), con `credentials:'include'` como el resto del admin. La variable JS `currentExpedienteCardId` ya existe y contiene el `card.id` al abrir el modal (verificar con grep `currentExpedienteCardId`).

- [ ] **Step 1: Agregar tabs al HTML del modal**

Localizar `class="expediente-tabs"` en `public/admin.html`. Junto a los botones de tab existentes, agregar cuatro nuevos siguiendo EXACTAMENTE el patrón de los existentes (mismas clases y mecanismo de switching — leer el JS actual del modal antes de escribir):

- `📋 Ficha` (tab id `exp-tab-ficha`)
- `✍️ Consentimientos` (tab id `exp-tab-consents`)
- `🔬 Diagnóstico` (tab id `exp-tab-diagnosis`)
- `⚡ Láser` (tab id `exp-tab-laser`)
- `📁 Documentos` (tab id `exp-tab-documents`)

Y sus 5 paneles de contenido dentro de `class="expediente-content"`:

- **Ficha**: badge de estado (`Sin enviar` gris / `Enviada` amarillo / `Borrador` azul / `Firmada ✅` verde) + botón `Enviar ficha por WhatsApp` (`POST /send-ficha`, confirm antes) + link al PDF si `pdfWebViewLink` + tabla de solo-lectura con todas las respuestas (datos personales, datos de interés con Sí/No+detalle, condición, cuestionarios respondidos, rutina, autorización de fotos).
- **Consentimientos**: lista de `consents` (tipo, fecha de firma, estado, link PDF) + botón `Enviar consentimiento láser` (`POST /send-consent`).
- **Diagnóstico**: formulario editable (tipo de piel, alteración, causas, tx cosmético, pronóstico, costo, cosmetóloga) con `Guardar` (`PUT /diagnosis`) y `Exportar PDF a Drive` (`POST /diagnosis/:id/pdf`); lista de diagnósticos previos.
- **Láser**: tabla (Fecha, Cosmetóloga, Zona, Frecuencia, Fluencia, Intensidad, Observaciones, acciones) + fila de captura rápida al final (`POST /laser-sessions`); editar inline (`PUT`) y borrar con confirm (`DELETE`).
- **Documentos**: dropzone (input file multiple + drag&drop) → `POST /documents` con `FormData` campo `files`; lista con icono por tipo, nombre → abre `webViewLink` en pestaña nueva, badge `Importado`/`Generado`, botón borrar (confirm; borra el registro, NO el archivo de Drive).

- [ ] **Step 2: JS del modal**

En la sección `// ===== SISTEMA DE EXPEDIENTE DE CLIENTA =====`, agregar `loadExpedienteDigital(cardId)` que haga `GET /api/expedientes/${cardId}` y pinte los 5 paneles; llamarla desde `openClientRecord()` (localizar el punto donde ya carga datos y añadir la llamada). Todos los fetch con `credentials: 'include'` y manejo de error con el helper de toast/alert que ya use el modal (grep para ver cuál usa).

- [ ] **Step 3: Verificar manualmente**

Server local + admin logueado: abrir expediente de una clienta → se ven las 5 pestañas nuevas; `Enviar ficha` responde `{success:true}` y llega el WhatsApp (o queda registrado el intento en logs si Evolution no está conectada en local); capturar un diagnóstico y una sesión láser y verificar persistencia recargando; subir un PDF de prueba (NO uno real de clienta) a Documentos y abrir su link de Drive.

- [ ] **Step 4: Commit**

```bash
git add public/admin.html
git commit -m "feat(expedientes): pestañas Ficha/Consentimientos/Diagnóstico/Láser/Documentos en el admin"
```

---

### Task 11: Cron de reintento de subidas a Drive

**Files:**
- Modify: `src/scheduler/cron.js`

**Interfaces:**
- Consumes: `driveService`, `expedientePdf`, `prisma`. Reintenta `IntakeForm`/`ConsentDoc` con `driveUploadPending=true`.

- [ ] **Step 1: Agregar el job**

En `src/scheduler/cron.js`, dentro de `startScheduler()` (seguir el patrón de los `cron.schedule` existentes), agregar:

```js
    // Reintento de PDFs de expediente que no pudieron subirse a Drive
    cron.schedule('*/30 * * * *', async () => {
        try {
            const { isDriveConfigured } = await import('../services/driveService.js');
            if (!isDriveConfigured()) return;
            const { buildIntakePdf, buildConsentPdf } = await import('../services/expedientePdf.js');
            const { ensureClientFolder, uploadBuffer } = await import('../services/driveService.js');

            const pendingIntakes = await prisma.intakeForm.findMany({
                where: { driveUploadPending: true, status: 'signed' },
                include: { record: true }, take: 10,
            });
            const pendingConsents = await prisma.consentDoc.findMany({
                where: { driveUploadPending: true, status: 'signed' },
                include: { record: true }, take: 10,
            });
            for (const item of [...pendingIntakes.map(x => ({ x, kind: 'intake' })), ...pendingConsents.map(x => ({ x, kind: 'consent' }))]) {
                try {
                    const card = await prisma.card.findUnique({ where: { id: item.x.record.cardId } });
                    if (!card) continue;
                    const pdf = item.kind === 'intake' ? await buildIntakePdf(item.x, card) : await buildConsentPdf(item.x, card);
                    const folderId = await ensureClientFolder(card);
                    const name = `${item.kind === 'intake' ? 'Ficha Clínica' : 'Consentimiento Láser'} – ${new Date(item.x.signedAt).toISOString().slice(0, 10)}.pdf`;
                    const up = await uploadBuffer({ folderId, name, mimeType: 'application/pdf', buffer: pdf });
                    const data = { pdfDriveFileId: up.id, pdfWebViewLink: up.webViewLink, driveUploadPending: false };
                    if (item.kind === 'intake') await prisma.intakeForm.update({ where: { id: item.x.id }, data });
                    else await prisma.consentDoc.update({ where: { id: item.x.id }, data });
                    console.log(`📁 [drive-retry] subido: ${name}`);
                } catch (e) { console.warn('[drive-retry] item falló:', e.message); }
            }
        } catch (e) { console.error('[drive-retry] error:', e.message); }
    });
```

- [ ] **Step 2: Verificar y commitear**

Run: `node --check src/scheduler/cron.js`
Expected: sin errores.

```bash
git add src/scheduler/cron.js
git commit -m "feat(expedientes): reintento cada 30 min de PDFs pendientes de subir a Drive"
```

---

### Task 12: Verificación E2E + checklist de deploy

**Files:** ninguno nuevo (solo verificación).

- [ ] **Step 1: E2E local completo**

Con `npm run dev`, `.env` completo y una Card de PRUEBA (crearla vía `/api/create-card?name=Prueba+Expediente&phone=5210000000001` o con el admin):

1. Admin → expediente de la clienta de prueba → `Enviar ficha` → copiar la `url` de la respuesta.
2. Abrir la URL en viewport móvil → llenar los 7 pasos → firmar → enviar.
3. Verificar: pestaña Ficha del admin = `Firmada ✅` con respuestas visibles; PDF en Drive dentro de `Expedientes/Prueba Expediente – 5210000000001/`; notificación "Ficha clínica completada" en el admin.
4. `Enviar consentimiento` → abrir link → firmar → mismo check (PDF + estado).
5. Capturar Diagnóstico → `Exportar PDF a Drive` → verificar archivo.
6. Agregar 2 sesiones láser, editar una, borrar una.
7. Subir un PDF dummy a Documentos, abrir su link de Drive, borrarlo de la lista.
8. Crear una CITA para un teléfono nuevo (sin ficha) → verificar en logs `📋 [ficha] Link de ficha enviado`.
9. Apagar temporalmente `GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID` (comentar en .env, reiniciar) → firmar otra ficha de prueba → verificar `driveUploadPending=true` y que al restaurar la env var el cron (o reinicio + espera) la sube.

- [ ] **Step 2: Checklist de deploy (coordinar con el usuario — NO push sin su autorización)**

1. Usuario crea carpeta Drive "Expedientes Venus" y la comparte como Editor con el `client_email` de la service account.
2. Agregar en Railway: `GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID`, `FICHA_TOKEN_SECRET`.
3. `npx prisma db push` ya se corrió contra la BD (Task 1) — confirmar que fue contra la BD de producción o repetirlo con el `DATABASE_URL` de Railway.
4. Pedir autorización de push al usuario; tras el deploy, repetir el flujo E2E (pasos 1-4) contra producción con la clienta de prueba.
5. Importación histórica: el usuario tiene los escaneados en `~/Desktop/Expedientes-escaneados-Venus/` — se suben clienta por clienta desde la pestaña Documentos (drag & drop). Borrar la Card/expediente de prueba al final.

---

## Self-review del plan (hecho al escribirlo)

- **Cobertura del spec**: 4 documentos ✅ (Tasks 5/6/8/9/10), firma dibujada ✅ (8/9), BD+Drive ✅ (3/6/11), escaneados ✅ (Task 10 Documentos), link automático+manual ✅ (Tasks 6/7), privacidad ✅ (tokens Task 2, adminAuth Task 6, constraint de PII global), resiliencia Drive ✅ (Task 11), denormalización a ClientRecord ✅ (Task 6 submit).
- **Placeholders**: los Tasks 8-10 definen requisitos exhaustivos de UI en prosa con endpoints/IDs/textos exactos en lugar de HTML completo (≈1500 líneas); es deliberado: el copy, las preguntas y la paleta están especificados y el patrón visual a copiar (`agendar.html`, modal existente) está nombrado. Todo lo demás lleva código completo.
- **Consistencia de tipos**: `signFichaToken(cardId, purpose)` (T2) = uso en T6/T7; `ensureClientFolder(card)`/`uploadBuffer({folderId,name,mimeType,buffer})` (T3) = uso en T6/T11; `buildIntakePdf(intake, card)` etc. (T5) = uso en T6/T11; rutas públicas `/api/expedientes/public/...` (T6) = las que consumen T8/T9; `QUESTIONNAIRES` (T5) = fuente de las preguntas de T8.

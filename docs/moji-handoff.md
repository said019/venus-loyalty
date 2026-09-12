# Moji Skin Analyzer × Venus — brief de handoff (para Codex u otro agente)

Estado al 9-sep-2026. Todo lo de abajo está verificado salvo donde se dice
"sin probar". Repo: `said019/venus-loyalty` (Node/Express + Prisma/Postgres en
Railway; frontend vanilla en `public/`, admin = `public/admin.html`, ~20k líneas).

## 1. Objetivo del dueño y sus restricciones (no negociables)

- Quiere **una interfaz propia** para su skin analyzer que se abra **como un link
  en la pantalla del aparato**. **No quiere cable USB ni instalar un APK.**
- El análisis de piel (poros, manchas, arrugas…) **se queda en la nube del
  fabricante**: ya entra a Venus por importación de links compartidos
  (`src/routes/skinAnalysis.js` → `POST /import`). No hay que replicar el motor.
- Lo que falta y sí quiere: **capturar fotos de seguimiento desde el aparato
  directo al expediente de la clienta** (ver §6).

## 2. El aparato (verificado desde su propio navegador)

Reporte real recibido el 9-sep-2026 vía `public/moji-test.html`:

| Dato | Valor |
|---|---|
| Modelo / SoC | **Moji A3**, placa **RK3399-S9932** (Rockchip) |
| Android / navegador | **Android 8.1.0 · Chrome 70.0.3538** (WebView Chromium) |
| Pantalla | 1080×1920 (vertical), DPR 1, idioma es-US |
| Cámara expuesta al navegador | **1 sola: "camera 0, facing back" = la cámara del análisis** (foto de prueba muestra el aro del aparato y el LED) |
| Resolución vía `getUserMedia` | en vivo **2064×1548 @24fps**; foto **1920×1080** vía `ImageCapture.takePhoto()` |
| APIs disponibles | `getUserMedia`, `enumerateDevices`, `ImageCapture`, **WebUSB sí**, **WebSerial no** |
| Contexto seguro | sí (https) |

**Consecuencias para código que corra ahí (Chrome 70):** hay `async/await`,
template literals, `fetch`, `Promise.all`, `URLSearchParams`. **NO hay**
optional chaining (`?.`), nullish coalescing (`??`), `Array.prototype.at`,
`String.replaceAll`, `Intl.RelativeTimeFormat`. Una sola de esas rompe TODO el
`<script>` sin error visible. `moji-test.html` ya respeta esto: úsalo de patrón.

## 3. Fabricante, nube y API

- Fabricante real: **Shenzhen Zhimei Lihe (bitmoji-tek)**, `mj@bitmoji-zmlh.com`,
  +86-755-23614912. Canta Esthetic solo lo revende.
- Nube: región internacional `a3ff-api.bitmoji-zm.com`; la app del aparato es
  `com.silverllt.skincenter` (build `A3_Overseas`). Los "share links" que Venus
  importa vienen de esa nube (`yiyuanShareId` en el modelo).
- **API pública documentada:** `http://developer.bitmoji-zm.com` (título
  "bitmoji api"), catálogo JSON en `/api/index/getapilist` (125 endpoints).
  Los relevantes: `Service/TaskStart` (SerialNumber, UserCode, NickName, Sex,
  Age) dispara un análisis desde fuera; `Service/TaskQuery`, `Service/FileUrl`,
  `Service/DeviceState`; `Report/GetResultImages` (imágenes por espectro),
  `Report/GetPdfUrl`, `Customer/*`. **Requiere credenciales ligadas al serie del
  aparato** — hay que pedirlas al fabricante; no se han pedido. No sondear sus
  servidores a ciegas.

## 4. Luces (protocolo extraído, SIN probar en hardware)

Descompilando el APK oficial (jadx): el driver board recibe **texto ASCII** por
UART `/dev/ttyS4` a **115200 8N1 raw**, terminado en `\n\r` (en ese orden):
`TC{L|C|R}CMD_{W|P|N|UV|WS}{pct}%` (zona × luz × porcentaje; el A3 usa solo
`C`), `TCCMD_OFF`, `TCCMD_PWM_SETL` (antes de la primera luz), `TC_HEART`
(una vez), `VER_QUERY` (si responde "V2" → omitir zonas en 0%). Detalle con la
clase de origen de cada dato: `tools/moji-luces/PROTOCOLO.md`; puente por adb +
panel web: `tools/moji-luces/luces.mjs`; prueba de vida: `prueba-en-maquina.sh`.
**Un navegador no puede escribir a esa UART** (ni con WebUSB: no es USB). Por la
restricción "sin APK", las luces quedan **en pausa**. Para seguimiento fotográfico
basta la luz blanca, que la app oficial deja encendida al abrirse.

## 5. Lo que ya existe en Venus (no reescribir)

- **Modelos** (`prisma/schema.prisma`): `SkinAnalysis` (yiyuanShareId, ageReal/
  ageBiological, skinType crudo p.ej. `mid_oil`, skinColor, ita, overallScore,
  aiSummaryEs, aiRecommendations JSON, treatmentSuggestions JSON, rawResponse),
  `SkinAnalysisScore` (13 métricas: acne, blackhead, pore, spot, pigment,
  uv_spot, pockmark, wrinkle, texture, collagen, ext_water, sensitive,
  dark_circle; score 0-100, severity excellent|good|moderate|concern|critical),
  `SkinAnalysisImage`. `ClientRecord`/`ClientPhoto`/`TreatmentSession`,
  `IntakeForm` (ficha clínica firmada), `ConsentDoc`.
- **Rutas:** `src/routes/skinAnalysis.js` montado en `/api/skin-analysis`
  (`POST /import`, `GET /by-card/:cardId` → lista desc con SOLO scores
  concern/critical, `GET /:id` → detalle completo con las 13 y las imágenes,
  `GET /` lista, `POST /:id/regenerate-narrative`, `GET /public/:id`,
  `GET /image-proxy`). `src/routes/clientRecords.js` montado en
  `/api/client-records` (adminAuth): `GET /card/:cardId` → `data` = record
  (con `id`, `sessions`, `photos`); **`POST /:recordId/photos`** multipart
  campo `photo` + body `sessionId?, type (before|after|progress, default
  progress), category?, area?, description?` → sube a Cloudinary y crea
  `ClientPhoto`; `POST /:recordId/photos/bulk` campo `photos[]` (máx 10).
- **Páginas:** `public/skin-analysis.html` (+`.js`, analyzer/import, acepta
  `?cardId=` y `?view=id`), `public/skin-report.html` (reporte público),
  `public/moji-test.html` (diagnóstico de cámara; latido ES5 + `window.onerror`),
  atajo `GET /cam` → redirige a `/moji-test.html?t=<token>`.
- **Diagnóstico:** `POST/GET /api/public/moji-test?t=61508435890a6bf0159dfe66`
  (guarda/lee Setting `moji-camera-test`; el POST va ANTES del `express.json()`
  global porque ese tiene tope 100kb), `GET /api/public/moji-ping?t=…&ua=…&e=…`.
  Token fijo, solo para diagnóstico; retirar cuando ya no sirva.
- **Expediente** (`/admin/clientas/:cardId`, todo en `admin.html`): pestañas
  Resumen · Ficha · Tratamientos · Láser · Análisis IA · Fotos · Documentos.
  Funciones clave: `openExpedienteView`, `loadExpedienteDigital` (fetch
  `/api/expedientes/:cardId` → `{card,intake,record,consents,diagnoses,
  laserSessions,documents}`), `renderResumenPanel`, `renderResumenPerfil`,
  `expRecomendaciones`/`renderResumenRecos` (señales del cuestionario),
  `loadExpedienteSkinAnalysis`/`renderExpedienteSkinAnalysis`,
  `expSugerirTratamientos` + `EXP_METRIC_KEYS` (métrica → palabra clave →
  servicio real de `/api/services`, excluye depilación; paquete si existe),
  `expResolverCard` (tarjeta sin depender de la lista), bandera
  `expedienteApptsLoaded`. Constantes ya existentes: `EXP_COND_TITLES`,
  `EXP_QUESTIONS` (no redeclarar).
- **Auth admin:** cookie httpOnly `adm` (JWT), `POST /api/admin/login {email,
  password}`. Rutas admin usan `adminAuth`; recepción tiene `role: 'recepcion'`.

## 6. `/captura` — CONSTRUIDO el 10-sep-2026 (`public/captura.html`, atajo `GET /captura`)

Lo de abajo era la propuesta; se construyó tal cual con estas notas: login embebido en la página (POST /api/admin/login → cookie `adm`; la sesión se detecta con GET /api/admin/me), rotación del sensor con botón "Girar" guardada en localStorage (arranca en 90°), foto por `ImageCapture.takePhoto()` con fallback a canvas del video, siempre re-dibujada en canvas para aplicar la rotación y salir JPEG 0.92, anti doble-toque, y sin `?.`/`??`. Verificado en Chrome con cámara simulada (11 casos, incluido el multipart real). Pendiente: probarlo en el Moji.


**`public/captura.html` → `venuscosmetologia.com.mx/captura`** para abrirse en
el Moji (1080×1920, Chrome 70, tacto):

1. Requiere sesión admin en ese navegador (cookie `adm`); si no hay, mandar a
   `/admin` a iniciar sesión y volver.
2. Buscar clienta: `GET /api/admin/cards-firebase?page=1&limit=6&q=<texto>`
   (devuelve `items[]` con `id,name,phone`).
3. Obtener/crear su record: `GET /api/client-records/card/<cardId>` → `data.id`.
4. Vista en vivo: `getUserMedia({video:{facingMode:'environment',
   width:{ideal:2064},height:{ideal:1548}}})`; guía para centrar la cara;
   la imagen del sensor llega **rotada 90°** respecto a la pantalla — corregir
   con CSS o al pintar al canvas.
5. Selector tipo (before|after|progress) y categoría/área (facial|corporal|
   depilación + zona libre), y descripción opcional.
6. **Tomar:** `ImageCapture.takePhoto()` (fallback canvas del `<video>`), JPEG
   ~0.92, `POST /api/client-records/<recordId>/photos` (FormData: `photo`,
   `type`, `category`, `area`, `description`). Mostrar confirmación y miniatura;
   botón "otra foto" / "cambiar clienta".
7. Anti doble-toque en "Tomar" (lección del repo: seis taps = seis registros).
8. Sin `?.`/`??`; probar el `<script>` con `node --check` y en Chrome con
   `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.

Resultado: la foto aparece en Expediente → Fotos y en la comparación
antes/después. Luz: blanca (la de la app oficial); UV/polarizada quedan fuera.

## 7. Otros pendientes acordados/ofrecidos (con spec corta)

- **"Perfil de piel (IA)" en Resumen del expediente** (propuesto, sin "sí"):
  bloque arriba de Datos clave con el último análisis: fecha, `overallScore`,
  tipo de piel traducido (`mid_oil`→Mixta grasa, `oil`→Grasa, `dry`→Seca,
  `mid_dry`→Mixta seca, `neutral|normal`→Normal), fototipo, edad biológica vs
  real, `aiSummaryEs`, métricas en atención (concern/critical) y las mejores,
  `treatmentSuggestions[]` (treatment · sessions · frequency), y con ≥2 análisis
  la evolución (global y por métrica). Datos: `by-card` para la lista +
  `GET /api/skin-analysis/:id` del último (y del anterior). Aplicar la misma
  traducción de `skinType` en la tarjeta de la pestaña Análisis IA.
- **"Ya pagó / Registrar anticipo" en Modificar Cita**: abre el diálogo de
  apartar (`openCreditDialog('deposit')`) prellenado con la clienta, esa cita
  en "¿Para cuál cita?" y el precio como monto sugerido. Sistema de apartados:
  `src/routes/credits.js`, `registrarApartado`, `sourceRef` idempotente.
- **Aviso de privacidad**: `public/privacy.html` no declara el uso de datos de
  salud (alergias, medicamentos, condiciones) para segmentar/enviar mensajes;
  antes de recordatorios por condición hay que agregar esa finalidad + casilla
  en `public/ficha-clinica.html`.
- Cosmético: `skinType` crudo en la tarjeta de Análisis IA.

## 8. Cómo se ha verificado (y trampas del repo)

- Arnés: puppeteer-core + Chrome local, servidor estático sobre `public/` que
  sirve `admin.html` para cualquier `/admin/*`, e interceptación de `/api/*` con
  fixtures reales (guardadas de producción con la sesión del dueño). Vive en un
  scratchpad efímero; reconstruirlo cuesta `npm i puppeteer-core@23`.
- Verificación en vivo: iniciar sesión con `POST /api/admin/login`, poner la
  cookie `adm` en puppeteer, abrir la URL real, leer el DOM. Borrar la cookie
  del disco al terminar.
- **Deep-link:** al abrir `/admin/...` por URL, **nada puede depender de que
  otra vista haya cargado antes** (`cardsCache`, KPIs reconstruidos). Ya
  pasaron dos bugs de esa familia (switchTab con cargadores fantasma; citas del
  expediente).
- `express.json()` global tiene tope 100kb: rutas con cuerpos grandes van antes.
- Otra sesión pushea a `main` en paralelo: `git fetch` + verificar
  `origin/main == HEAD~1` antes de `push`; si avanzó, rebase.
- El webhook GitHub→Railway a veces no dispara: `railway deployment list`; si no
  hay deploy, `railway redeploy --from-source -y` desde el directorio vinculado.
- La carpeta `/Users/saidromero/Documents/venus-loyalty` está en un disco
  fallando y la edita otra sesión: trabajar en un clone fresco, no ahí.
- Verificación de deploy: elegir un marcador **ausente** del archivo en vivo
  antes de pushear (`curl | grep -c` = 0) y esperar a que aparezca.

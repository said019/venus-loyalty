# Venus Skin: la app completa en el Moji

Fecha: 2026-10-21. Dueño del producto: Said Romero (Venus Cosmetología).

## Para qué

Hoy una valoración de piel en Venus toma dos sistemas. En el Moji (analizador
RK3399-S9932) la cosmetóloga abre la app china `com.yiyuan.skin`, inicia sesión,
escribe el nombre de la clienta, toma la secuencia de 7–8 fotos con las luces y
recibe un reporte calculado en la nube del fabricante. Luego escanea el QR de
ese reporte en el admin de Venus, que lo importa y genera una lectura con IA.

Queremos que todo pase dentro de Venus: una sola app en el Moji, con las
clientas ya registradas, la misma secuencia de luces, el análisis hecho por
Venus y el resultado disponible en dos lugares: en la pantalla del Moji al
terminar la toma y en el perfil de la clienta (su tarjeta) con el diseño nuevo.
La app china y el paso del QR dejan de usarse.

Se usa dentro de Venus y se mostrará al público en redes. No se vende a otros
spas: nada de precios de licencia, marca blanca ni página de venta.

## Metas

1. La cosmetóloga completa una valoración en el Moji sin salir de Venus:
   sesión → clienta → secuencia de luces → fotos en el expediente → resultado.
2. Al terminar la toma, el Moji muestra el resultado a la clienta ahí mismo.
3. La clienta ve ese mismo resultado después, desde su tarjeta en su celular,
   con el diseño aprobado en los mockups (Resumen, Mapas, Progreso, Plan).
4. Las fotos originales se conservan sin alterar y el análisis sale con la
   revisión profesional que ya existe.

## No metas

- Reproducir los puntajes del fabricante (edad de piel, puntaje global). Los
  mapas de Venus son detectores propios; no se presentan como equivalentes.
- Vender o licenciar la app. Sin marca blanca.
- Cambiar la app original del fabricante ni usar su nube.
- Rediseñar el admin de Venus más allá de lo necesario para este flujo.

## Anti-metas (si pasa esto, salió mal aunque "funcione")

- Que una clienta vea un resultado que nadie revisó.
- Que una luz quede encendida, o que UV/Wood se usen con una clienta antes de
  probarlas con el equipo vacío.
- Que se pierda una foto original o se reemplace por una procesada.
- Que una clienta vea análisis de otra, o que el reporte sea accesible sin la
  llave de su tarjeta.
- Que el reporte muestre números o diagnósticos médicos. Es una valoración
  cosmética con lenguaje claro.

## Restricciones

- El Moji corre Android 8.1 con WebView Chrome 61: nada de `?.`, `??`,
  `innerHTML` con datos, ni APIs modernas en las páginas que carga el aparato.
- La app nativa `mx.venus.mojileds` 0.9.0 (instalada) ya implementa la
  secuencia de 8 capturas con 6 luces copiada del mapa de la app china:
  blanca(0), positiva(4), UV(5), Wood(2), negativa(1), azul(3), blanca, blanca
  (`tools/moji-capture/android/src/.../CaptureSequence.java`). Solo la luz
  blanca está verificada físicamente. No se cambia la APK en este proyecto
  salvo que la prueba física lo exija.
- Hospedaje en Railway. Al momento de escribir esto Railway no acepta builds;
  el trabajo se deja listo en la rama `feat/skin-maps-history`
  (clon `~/dev/venus-loyalty-skin`) para desplegarse cuando vuelva.
- El git de la carpeta del Escritorio está roto por iCloud; no se trabaja ahí.
- La base de datos es Postgres con Prisma; cada cambio de esquema lleva
  migración en `prisma/migrations`.
- Pruebas con `node --test`; la suite de skin debe seguir en verde.

## Lo que ya existe y se reutiliza (verificado en el código)

- Sesión de staff en el aparato y elección de la clienta registrada:
  `public/captura.html` + `public/moji-capture.js`, que suben cada foto al
  expediente (`ClientPhoto`) con `modo=<clave de luz>` en la descripción.
- Disparo de la secuencia: `venus-moji://sequence?request=…`, progreso por
  `window.venusNativeSequenceProgress`, JPEG por `/__native-sequence/<req>/<i>.jpg`.
- Análisis propio: `src/services/ai/skinAdvisor/workflow.js` (OpenAI u Ollama
  Cloud, borrador → generación → aprobación del dueño), mapas locales con
  OpenCV (`tools/skin-layers`, ya con capa de arrugas y guardado en historial
  en la rama), y el reporte de staff `public/skin-photo-report.js`.
- Tarjeta pública de la clienta: `public/index.html` lista análisis en
  `#skin-block` desde `GET /api/public/card/:id/skin-analyses`, hoy solo del
  modelo `SkinAnalysis` (importado del QR). `ClientRecord.cardId` enlaza
  expediente y tarjeta.
- Mockups aprobados del reporte para la clienta:
  https://claude.ai/artifact/Fbds9bgmrZ5fipk7BX2K7C (Prata + Manrope, marco
  en arco del logo, destellos en zonas, selector de mapas, progreso, plan).

## Cómo se hace (decidido)

### 1. Flujo en el Moji

1. La cosmetóloga abre la app Venus en el Moji. Si no hay sesión, inicia
   sesión con su cuenta de Venus (ya existe).
2. Busca y elige a la clienta registrada (ya existe).
3. Pulsa "Tomar fotos". Mientras la secuencia de luces no haya pasado la
   prueba física (sección 5), ese botón toma una sola captura con luz blanca
   (`venus-moji://still`, ya verificada). Cuando Said active la bandera
   `SKIN_SEQUENCE_ENABLED=true` en Railway, el mismo botón corre la secuencia
   nativa de 8 capturas; la página muestra el avance luz por luz y recuerda
   que la clienta mantenga los ojos cerrados (texto ya existente en
   `moji-capture.js`). La secuencia nativa es fija (no hay modo parcial), por
   eso la bandera es todo o nada y no se toca la APK.
4. Las fotos suben al expediente con su modo. Al terminar, la página crea
   automáticamente el borrador de valoración con la captura blanca, el
   consentimiento registrado y las respuestas de contexto (tomadas de la
   ficha clínica de la clienta si existe; en cabina solo se pregunta el
   objetivo), y lanza la generación con IA y los mapas locales.
5. Mientras la IA trabaja (1–2 min), el Moji ya muestra la foto blanca con
   los mapas. Cuando la valoración queda lista, la cosmetóloga la revisa en
   el Moji: lee y corrige el texto si hace falta, elige los servicios del
   plan y escribe la rutina de casa (sección 8), y aprueba. Al aprobar, el
   reporte se muestra completo en la pantalla del Moji con el diseño nuevo y
   queda visible en la tarjeta de la clienta.
6. Botón "Enviar enlace por WhatsApp": manda a la clienta el enlace de su
   reporte (mismo patrón de envío que `sendFichaClinicaLink` en
   `src/services/whatsapp-v2.js`). No es un paso de publicación: la
   aprobación ya publicó.

### 2. Resultado en la tarjeta de la clienta

- Nuevo origen de datos para `#skin-block`: además de `SkinAnalysis`, el
  endpoint público lista las valoraciones `SkinAdvisorAssessment` con
  `approval` registrada y sin `retiredAt` (columna nueva, ver sección 6)
  cuyo `recordId` pertenece al expediente con `cardId` = tarjeta. El estado
  `superseded` no las oculta: hoy `createDraft` marca `superseded` a todas las
  activas, incluida la aprobada, y la clienta no debe perder su reporte
  cuando empieza una nueva toma. La "valoración anterior" para Progreso es la
  aprobada inmediatamente previa, aunque esté superseded. Las importadas del
  QR se quedan como historial, marcadas "análisis anterior".
- Nueva página pública `public/mi-piel.html` (con `mi-piel.js` y `mi-piel.css`)
  que implementa los mockups: Resumen, Mapas, Progreso y Plan. Se abre con
  `?card=<cardId>&v=<assessmentId>`; el servidor solo responde si la
  valoración pertenece a esa tarjeta y está aprobada. Misma política que la
  tarjeta: sin sesión, `Cache-Control: private, no-store`, `X-Robots-Tag:
  noindex`.
- Contenido: foto original blanca con destellos en las zonas con hallazgos,
  "Lo que vimos" en lenguaje claro desde la valoración aprobada, los mapas
  guardados (poros, textura, arrugas, manchas, puntos rojos, zonas rojas,
  brillo) con su explicación y "qué ayuda", progreso contra la valoración
  aprobada anterior de la misma clienta, y el plan (servicios activos y
  rutina) con botón de WhatsApp para agendar.
- Sin números ni puntajes. Las capturas UV/Wood/polarizadas se muestran como
  vistas complementarias, nunca como medición.
- Compatibilidad: la página debe funcionar en el WebView del Moji (Chrome 61)
  porque es la misma que se muestra en cabina.

### 3. Resultado en el Moji

- La misma `mi-piel.html` se abre dentro del flujo de captura al terminar,
  en modo cabina: sin barra de navegación inferior de la tarjeta, con botón
  "Listo" que vuelve a la captura y cierra la sesión de la clienta en pantalla.
- La app nativa ya permite navegar a `/skin-advisor.html`; hay que agregar
  `/mi-piel.html` a la lista de documentos permitidos en `Policy.java`
  (cambio mínimo de APK) o, si se prefiere no tocar la APK, servir la vista de
  cabina dentro de `skin-advisor.html`. Decisión del constructor; ver abajo.

### 4. Análisis

- Proveedor: el que esté configurado (`SKIN_ADVISOR_PROVIDER`); hoy OpenAI en
  producción. No se cambia en este proyecto.
- Entrada a la IA: solo la captura blanca, como hoy. Las demás luces se
  guardan y se muestran, no se analizan todavía.
- Mapas locales: los de la rama (incluye arrugas), guardados en Cloudinary y
  en `skin_layer_sets`.

### 5. Prueba física (parte del proyecto, no opcional)

Con el equipo vacío y el operador presente, antes de usar con clientas:
luz por luz, confirmar que enciende y se apaga; después la secuencia
completa; después captura → subida → valoración → vista en Moji → vista en
tarjeta con una cuenta de prueba. Registrar resultados en
`tools/moji-capture/android/VERIFICATION-<fecha>.md`. UV y Wood quedan
deshabilitadas para clientas hasta que esta prueba pase y haya precauciones
de exposición escritas.

### 6. Quién aprueba (decidido: recomendación aceptada por Said)

- La cosmetóloga que tomó las fotos revisa y aprueba desde el Moji, con la
  clienta presente, usando la pantalla de corrección que ya existe. Pueden
  aprobar las cuentas con rol `admin` o `staff`; `recepcion` no.
- Cada aprobación registra quién la hizo (ya existe `approval.actorId`).
- Solo el dueño autorizado (`SKIN_ADVISOR_APPROVER_ID`) puede retirar de la
  tarjeta o corregir una valoración ya publicada. Esa acción es nueva:
  columna `retiredAt` (+ `retiredById`) en `skin_advisor_assessments` con su
  migración; retirar no borra nada.
- Esto cambia la regla actual de `workflow.approve` (hoy exige dueño + rol
  admin); hay que ajustar `account(..., approve)` y sus pruebas
  (`tests/skin-workflow.test.js`, `skin-owner-authorization.test.js`) sin
  abrir la aprobación a recepción ni a cuentas sin sesión.
- Cuenta en el Moji: cada cosmetóloga inicia sesión con su propia cuenta
  (rol `staff`), nunca con la del dueño, para que la aprobación quede a su
  nombre. Hoy la búsqueda de clientas de `captura.html`
  (`/api/admin/cards-firebase`, `server.js` ≈ 5986) exige rol `admin`; se
  abre a `staff` solo para lectura, o se crea un endpoint de búsqueda
  reducido para la captura. Decisión del constructor entre esas dos.
- Valoraciones con información faltante: hoy cualquier elemento en
  `missingInformation` o `quality.status = retake` deja la valoración en
  `needs_information` y bloquea la aprobación. En cabina casi siempre habrá
  respuestas sin contestar, así que la regla cambia: `retake` (foto mala)
  sigue bloqueando; `missingInformation` ya no bloquea, y lo que falte se
  muestra a la clienta como "para confirmar en tu siguiente visita". El
  prompt deja de pedir que liste como faltantes las vistas que el protocolo
  no tiene (solo hay luz blanca para la IA).

### 7. Análisis chinos anteriores (decidido)

Se conservan en la tarjeta como historial, marcados "análisis anterior". No
se importan más (el flujo de QR deja de usarse), pero no se borran.

### 8. De dónde sale cada parte del reporte (decidido)

Hoy la IA no produce plan ni progreso: `activeServices` y `protocols` están
fijos en `[]` por diseño (sin catálogo comercial sin revisar), el contrato
prohíbe puntajes y los conteos de los mapas son candidatos, no hallazgos.
Para no inventar nada, en v1 cada parte sale de aquí:

- **Lo que vimos:** las `observations` aprobadas (o corregidas por la
  cosmetóloga al aprobar), con su zona. El prompt gana una instrucción de
  escribir cada descripción en lenguaje claro para la clienta, sin jerga;
  el contrato y los límites no cambian.
- **Mapas:** los `skin_layer_sets` guardados de la captura blanca, con la
  explicación fija por capa (qué es, qué ayuda) escrita en `mi-piel.js`.
  Sin conteos.
- **Plan, en cabina:** la cosmetóloga elige al aprobar, de los servicios de
  piel activos del catálogo de Venus que ya existe en la base (nombre,
  duración y precio reales), con una cadencia sugerida por servicio. No se
  crea catálogo nuevo.
- **Plan, en casa:** texto libre de la cosmetóloga al aprobar, separado en
  mañana y noche, prellenado con lo que escribió en la valoración anterior
  de esa clienta. Sin marcas ni productos fijos en el código.
- **Próxima cita sugerida:** la cosmetóloga elige una semana al aprobar.
- **Progreso:** comparación lado a lado (foto y mapa) entre la aprobada y
  la aprobada anterior. Los veredictos por zona ("Mejoró", "Se mantiene",
  "A cuidar") los marca la cosmetóloga al aprobar, opcionalmente; si no los
  marca, no aparecen. Nunca se calculan.
- Estos campos nuevos van en `approval` (JSON ya existente) como
  `approval.plan`, `approval.homeRoutine`, `approval.nextVisitWeek`,
  `approval.zoneProgress`; no requieren migración.

### 9. Camino a producción (decidido)

- Lo que despliega Railway es `main` de `said019/venus-loyalty`; el clon de
  trabajo tiene ese repo como `upstream`. El plan incluye el merge a `main`.
- Nada ejecuta `prisma migrate deploy` en el arranque y hay notas previas de
  deriva de esquema. Antes del primer despliegue el constructor revisa
  `_prisma_migrations` en producción por el proxy público de la base; si
  está en sincronía, `migrate deploy`; si no, el SQL de cada migración se
  aplica a mano y se marca con `migrate resolve`. Esto va como paso
  explícito del plan, con el SQL listado, y lo ejecuta Said o se ejecuta
  con su autorización en el momento.

## Queda al constructor

- Estructura exacta de `mi-piel.html` y cómo reutiliza `skin-report-data.js`
  y `skin-photo-report.js` sin romper el reporte de staff.
- Si la vista de cabina va en `mi-piel.html` (requiere agregar la ruta a
  `Policy.java` y recompilar la APK con `build.sh`) o dentro de
  `skin-advisor.html` (sin tocar la APK). Preferencia: sin tocar la APK si el
  resultado es el mismo.
- Forma del endpoint público combinado (puede ser uno nuevo
  `/api/public/card/:id/skin` que devuelva ambos orígenes ordenados por fecha).
- Cómo el flujo de captura crea el borrador automáticamente y cómo registra
  el consentimiento con la versión vigente (en cabina se pregunta el objetivo;
  el resto sale de la ficha clínica si existe).
- Cómo se lee `SKIN_SEQUENCE_ENABLED` desde la página de captura (por
  ejemplo en la respuesta de `/config`) sin exponer nada más.
- Orden de las tareas y pruebas. Sugerido: endpoint público + `mi-piel.html`
  (probable en navegador con datos sintéticos) → integración en captura →
  prueba física.

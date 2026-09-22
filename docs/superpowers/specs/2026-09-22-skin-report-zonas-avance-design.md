# Venus Skin — mapa de zonas, recomendación con menú real y avance

Fecha: 2026-09-22 · Estado: diseño aprobado en chat, pendiente de revisión escrita

## Por qué

- El botón **Venus Skin IA** del expediente abre `skin-advisor.html`: elegir fotos,
  cuestionario, casillas de consentimiento, borrador de OpenAI y aprobación. La dueña
  lo siente sin sentido: el aparato Moji/Yiyuan ya hace el análisis.
- El flujo que sí le sirve ya existe: `skin-analysis.html` importa el link del aparato
  y muestra la interpretación con IA, las preocupaciones, los tratamientos, la rutina,
  el PDF y el envío por WhatsApp (`?view=<id>`).
- Del reporte chino le gusta que enfoca **zonas de la cara**. Quiere eso mejorado,
  con recomendación de **su menú real** y **avance** entre escaneos.

## Qué pidió (literal) y qué suponemos

| Pidió | Suposición de diseño |
|---|---|
| Sin casillas ni pasos extra | Se retira `skin-advisor` del expediente; su código queda, sin enlace |
| Reporte para clienta **y** cosmetóloga | Misma información en dos páginas: `skin-analysis.html?view=` (admin) y `skin-report.html` (link público) |
| B · Cara con zonas | Plantilla fija de zonas sobre la foto blanca del aparato (no hay coordenadas en el JSON) |
| C · La IA recomienda lo mejor **de su menú** | El menú deja de estar escrito en el prompt y sale de la tabla `services` activa |
| D · Avance | Comparación contra un escaneo anterior de la misma tarjeta (`cardId`) |
| La revisa ella como análisis | Sin paso de aprobación; ella decide cuándo compartir el link |

Fuera de alcance: traducir los textos del aparato, que el escaneo llegue solo
(requiere credenciales del fabricante, ver `docs/moji-handoff.md`) y borrar el código
de `skin-advisor`.

## Datos disponibles (verificado con un share real, 2026-09-23)

`SkinAnalysis.rawResponse` guarda el JSON completo, así que **todo lo siguiente ya
está en la base para los análisis importados, sin migración**:

- Por zona, en `rawResponse.analysis`:
  - `skin_type.category[]`: `forehead`, `nose`, `left_cheek`, `right_cheek`, `chin`,
    cada una con `type` (oil/mid/dry), `level` (none/lightly/moderately/severely) y `score`.
  - `wrinkle.category[]`: `forehead`, `glabella`, `eyecorner`, `crowfeet`, `nasolabial`,
    cada una con `count`, `score` y `level`.
  - `dark_circle`: `leftLevel`, `rightLevel`, `type`.
- Sin desglose por zona (solo total, nivel y foto marcada): acné, puntos negros, poros,
  manchas, manchas UV, pockmark, sensibilidad, textura y colágeno. La foto marcada ya
  está en `SkinAnalysisScore.imageUrl`.
- No hay puntos de referencia de la cara (landmarks) ni rectángulo de la cara.
- Los links nuevos `zm.bitmoji-zmlh.com/...shareId=` funcionan con el importador actual
  (`zm.yiyuan.ai/skinSrv/analysis/shareDetail` responde el mismo JSON).

Regla: **no se inventan números por zona**. Las métricas sin desglose se muestran a
nivel cara completa, con su foto marcada.

## Componentes

### 1. `src/services/skinZones.js` (nuevo, puro, con pruebas)

`buildZoneMap(rawResponse) → { zones: Zone[], global: Finding[] }`

- `Zone = { key, labelEs, status: 'ok'|'watch'|'focus', findings: Finding[] }`
- Zonas: `frente`, `entrecejo`, `nariz`, `mejilla_izq`, `mejilla_der`, `menton`,
  `ojo_izq`, `ojo_der`, `surco_nasogeniano`.
- Asignación de datos a zonas:
  - grasa: forehead → frente, nose → nariz, left_cheek/right_cheek → mejillas, chin → mentón
  - arrugas: forehead → frente, glabella → entrecejo, eyecorner/crowfeet → ojos,
    nasolabial → surco nasogeniano
  - ojeras: leftLevel/rightLevel → ojo_izq/ojo_der
- El `status` de cada zona es el peor de sus hallazgos: none/lightly → `ok`,
  moderately → `watch`, severely → `focus`.
- `Finding = { metric, labelEs, levelEs, score, count? }`, en español
  («Grasa moderada», «Arrugas leves · 144»).
- Si falta una categoría, la zona se omite o queda sin hallazgos. Nunca truena con
  JSON viejo o parcial.

### 2. Mapa de zonas en el front (`public/skin-zones.js` + CSS)

- Un SVG encima de la foto `positive` (luz blanca), con `viewBox` normalizado 0–1000
  y una plantilla fija de trazos para las 9 zonas, calibrada contra capturas reales
  del Moji A3 (barbilla apoyada, encuadre constante).
- Color por estado usando los tokens de la página: verde, ámbar y rosa.
- Al tocar o hacer clic en una zona se muestra una tarjeta con sus hallazgos.
- Debajo va una tira de chips con las métricas de cara completa (acné, manchas,
  poros…). Al tocar un chip se ve la foto marcada del aparato a pantalla grande
  (reutiliza el lightbox actual y `/api/skin-analysis/image-proxy`).
- Accesible: cada zona es un `<button>` con `aria-label`. Hay una lista de zonas
  equivalente para lector de pantalla y para teclado.
- Lo usan `skin-analysis.html` (vista admin) y `skin-report.html` (público).
- Si la foto no carga o no hay datos de zona, el mapa no aparece; el resto del reporte sigue.
- Riesgo: si una captura sale descentrada, la plantilla queda corrida. Mitigación:
  trazos suaves (no contornos precisos), la lista de hallazgos es la fuente de verdad
  y la calibración se valida con 3 capturas reales.

### 3. Recomendación con el menú real

- `src/services/ai/skinMenu.js` (nuevo): `loadSkinMenu(prisma)` lee `services`
  con `isActive = true`, filtra por las categorías de piel y facial (lista de
  categorías permitidas configurable en un solo lugar; hoy «Básicos Venus» y
  «Especializados») y devuelve `{ id, name, description, price }` ordenado de forma estable.
- `skinPrompt.js`: la sección «MENÚ VENUS» fija se sustituye por la instrucción de
  usar solo el menú que llega en el mensaje. El menú viaja en un segundo bloque de
  sistema con caché propio (cambia solo cuando cambia el catálogo), así el prompt
  base sigue siendo constante.
- Salida de la IA: se agrega `serviceId` a cada recomendación. Al guardar se valida
  contra el menú enviado; si se descarta alguna recomendación con nombre o id que no
  existe, se registra en el log.
- Al mostrar se une con `services` para precio vigente y botón:
  - admin: **Agendar** abre `/admin?nuevaCita=1&cardId=<id>&serviceId=<id>`. Esto es
    nuevo: hoy `admin.html` no lee esos parámetros. Se agrega un manejador que, al
    cargar, abre el modal de nueva cita con la clienta y el servicio puestos, y luego
    limpia la URL con el mismo patrón `history.replaceState` que usa `?calendar=`;
  - público: **Agendar por WhatsApp**, con mensaje prellenado con el tratamiento.
  - Si el servicio ya no existe o está inactivo, se muestra el nombre sin precio ni botón.
- Análisis viejos (sin `serviceId`): se busca por nombre exacto; si no coincide, sin botón.
- Se actualiza `tests/skin-prompt-contract.test.js`.

### 4. Avance entre escaneos

- `src/services/skinProgress.js` (nuevo, puro, con pruebas):
  `compareAnalyses(current, previous) → { days, metrics: [{ metric, labelEs, before, after, delta, trend }], zones: [...] }`
  - `trend`: `mejoró` si delta ≥ +5, `empeoró` si delta ≤ −5, si no `estable`.
    Mayor score = mejor piel.
  - Métricas que faltan en alguno de los dos escaneos: se omiten.
- Endpoint admin `GET /api/skin-analysis/:id/progress?against=<id>`: por omisión
  compara contra el escaneo anterior de la misma `cardId`; devuelve también la lista
  de fechas disponibles para el selector. Valida que ambos sean de la misma tarjeta.
- El `GET /public/:id` agrega `progress` (contra el anterior inmediato) con los mismos
  campos de solo lectura que ya expone. No expone ids de otros análisis.
- UI «Tu avance»: lista de antes → ahora ordenada por mayor mejora, más un comparador
  lado a lado de la foto marcada de la métrica elegida. En admin hay un selector de
  fecha; en público, solo el anterior inmediato.
- Si es el primer escaneo, la sección no aparece.

### 5. Un solo camino desde el expediente

- `public/admin.html`: `exp-action-skin` pasa a `/skin-analysis.html?cardId=<cardId>`
  y cambia su texto a «Venus Skin».
- `skin-advisor.html` deja de estar enlazado. Rutas y tablas intactas.

## Orden en las páginas

1. Encabezado (nombre, fecha, score general)
2. **Mapa de zonas** (nuevo)
3. Interpretación IA (titular y resumen)
4. **Tu avance** (nuevo, si hay escaneo previo)
5. Tratamientos recomendados, con precio y agendar
6. Rutina en casa
7. Análisis completo y galería (admin completo; público plegado)

## Pruebas

- Unitarias: `skinZones` (fixture `tests/fixtures/yiyuan-share-zonas.json`, share real sin datos personales, JSON parcial, JSON
  viejo sin `category`), `skinProgress` (umbrales, métricas faltantes),
  `skinMenu` (filtro de categorías e inactivos), validación de `serviceId`.
- Rutas: `/progress` (misma tarjeta, tarjeta ajena → 404, sin previo) y
  `/public/:id` con `progress`.
- Navegador: `skin-analysis.html?view=` y `skin-report.html` a 390px y 1440px,
  tocar zonas, chips, comparador y agendar.

## Criterio de éxito

Desde el expediente, un botón lleva a importar el link del aparato. El análisis
muestra la cara con zonas tocables, recomendaciones de servicios que existen hoy en el
catálogo con su precio y, si hay un escaneo previo, el avance. Todo sin una sola
casilla que llenar.

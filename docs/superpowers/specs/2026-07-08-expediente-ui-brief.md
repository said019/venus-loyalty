# Expediente de clienta — Design Brief (admin)

**Fecha:** 2026-07-08 · **Registro:** product · **Tokens:** DESIGN.md (avena/crema + oliva, Playfair + DM Sans, casi plano)
**Define el enfoque de UI del Task 10 del plan** `docs/superpowers/plans/2026-07-08-expedientes-digitales.md` (que ya fue actualizado a este diseño: vista completa, 6 secciones, mobile-first). Los endpoints del plan no cambian.

## 1. Resumen

El expediente de clienta pasa de modal flotante (roto: título con HTML escapado, header encimado, 9 pestañas desbordadas) a **vista completa dentro del admin**, diseñada primero para la **cosmetóloga con tablet o celular en cabina, durante la consulta, con la clienta presente**. Debe permitir ver lo crítico en 1-3 segundos (alergias, estado de documentos) y capturar sin fricción (diagnóstico, sesión láser).

**Escena de tema:** cosmetóloga de pie en cabina con luz cálida, tablet en mano, clienta recostada; mira la pantalla entre pasos del tratamiento. → Tema claro cálido por defecto (tokens light de DESIGN.md); si el admin está en modo oscuro, hereda el dark cálido de los tokens. Nunca negro-tech.

## 2. Acción primaria del usuario

**Ver las alertas de salud y el estado de la ficha de un vistazo, y capturar la sesión de hoy en menos de un minuto.** Todo lo demás es secundario.

## 3. Dirección de diseño

Sensación de **expediente de papel bien cuidado**: superficie crema mate, reglas hairline en lugar de tarjetas, tipografía serif solo para el nombre de la clienta, todo lo demás DM Sans. Cero "SaaS dashboard". El acento oliva se reserva para la pestaña activa, botones primarios y checks de "firmado". Estados de salud usan la paleta semántica cálida de DESIGN.md (`--warn` ámbar para alertas, `--err` rosa solo para destructivo, `--ok` salvia para firmado/completado).

**Prohibiciones vigentes** (DESIGN.md + registro product): sin emojis en el chrome (Font Awesome escaso), sin cards anidadas, sin side-stripes de color, sin sombras salvo ninguna (vista plana: ya no es diálogo), sin fuentes display en labels/botones, sin glow.

## 4. Estrategia de layout

### Contenedor
- Vista completa que **sustituye** la lista al abrir una clienta (patrón "push"): ruta `/admin/clientas/:cardId` si el admin ya rutea por path, o view-swap JS con `history.pushState` para que el botón atrás del navegador regrese a la lista. El z-index deja de existir como problema.

### Encabezado del expediente (siempre visible, se compacta al hacer scroll)
1. Fila 1: `← Clientas` (regreso, target 44px) · acciones a la derecha: `Enviar ficha` (primario si no hay ficha firmada, ghost si ya hay) y `WhatsApp` (ghost).
2. Fila 2 — identidad: nombre en Playfair 24-30px, debajo teléfono y meta corta (edad · tipo de piel · sellos de lealtad) en `--ink-2`.
3. Fila 3 — **franja de alertas de salud** (solo si existen): chips ámbar tenue (`--warn` sobre tinte suave) con icono `fa-triangle-exclamation`, p. ej. `Alergia: colágeno` `Asmática` `Embarazo`. Se alimenta de la Ficha Clínica firmada. Esta franja NUNCA se oculta al hacer scroll: es información de seguridad para tratamientos.
4. Fila 4: la barra de secciones (abajo).

### Navegación: de 9 pestañas a 6 secciones
| Nueva sección | Absorbe | Razón |
|---|---|---|
| **Resumen** | Datos (convertida a solo lectura) | Portada: alertas, datos clave de la ficha, estado de documentos, última/próxima cita, accesos rápidos |
| **Ficha** | Ficha | Respuestas completas de la Ficha Clínica + estado + reenviar |
| **Tratamientos** | Diagnóstico + Sesiones | El flujo real en cabina: diagnostico → registro de sesión |
| **Láser** | Láser | Formato propio (tabla de seguimiento), clientas que solo van a depilación |
| **Fotos** | Fotos + Comparar | "Comparar" es un modo dentro de Fotos (seleccionar 2 → lado a lado), no una pestaña |
| **Documentos** | Consentimientos + Documentos | Los consentimientos SON documentos legales; misma lista, con su estado de firma arriba |

- Pills horizontales (patrón tabs de DESIGN.md): inactiva = superficie + hairline; activa = relleno oliva, texto claro. Altura 48px.
- En celular la barra scrollea horizontal con **fade en los bordes** y la pestaña activa siempre auto-scrolleada a vista. Nunca se cortan a la mitad como hoy.

### Contenido
- Columna única, max-width 720px centrada en pantallas grandes; padding 16-20px en celular, 28-36px en tablet+.
- Secciones internas separadas por **regla hairline + título 13px caps tracked** (patrón KPI de DESIGN.md), no tarjetas.
- Formularios (Diagnóstico, sesión Láser): una columna, inputs 44px+, focus ring oliva 2px; en celular el botón `Guardar` va **sticky al fondo** con fondo superficie + hairline superior.
- Tabla Láser en celular: cada sesión se apila como renglón compuesto (fecha + zona en 15px/600, parámetros como meta 13px `--ink-3` en línea: `50 Hz · 12 J/cm² · Nivel 3`), acciones al tap. Nada de scroll horizontal.
- Fotos: cuadrícula 3 columnas (tablet) / 2 (celular), lazy loading; botón `Comparar` activa modo selección.

## 5. Diseño móvil (celular) — obligatorio, no se puede recortar

El celular es un caso de PRIMERA clase (la cosmetóloga en cabina puede traer solo su teléfono). Todo lo de esta sección es requisito de aceptación, no mejora opcional.

### Breakpoints
- **Celular ≤ 480px** (diseño base: se construye primero aquí)
- **Tablet 481-1024px** (el escenario más común en cabina)
- **Escritorio > 1024px** (columna 720px centrada; nada se estira a lo ancho)

### Encabezado en celular
- Fila de identidad compacta: nombre Playfair 22px, teléfono/meta en una sola línea truncada con elipsis.
- Al hacer scroll el encabezado se compacta a UNA fila sticky: `←` + nombre (16px, 600) + **los chips de alerta de salud se quedan visibles** (pueden compactarse a solo icono ámbar + primera alerta; tap despliega todas). La seguridad no se scrollea.
- Acciones (`Enviar ficha`, `WhatsApp`) se mueven a un botón `⋯` (menú) en la fila compacta; en estado expandido se ven como botones completos.
- Respetar `env(safe-area-inset-top/bottom)` (notch y home bar de iPhone).

### Barra de secciones en celular
- Scroll horizontal con `scroll-snap`, fade de 24px en ambos bordes como señal de "hay más", y la sección activa SIEMPRE auto-scrolleada a vista al entrar o cambiar.
- Pills de 44px de alto mínimo; tap area completa, no solo el texto.
- La barra es sticky justo debajo del encabezado compacto.

### Formularios en celular (Diagnóstico, Láser, edición)
- Una columna, labels arriba del input (nunca a la izquierda).
- `font-size` de inputs ≥ 16px (evita el auto-zoom de iOS Safari).
- Teclados correctos: `inputmode="numeric"` para números (frecuencia, fluencia, costo), `type="date"` nativo para fechas.
- Botón `Guardar` sticky al fondo (fondo `--surface` + hairline superior + safe-area). Cuando el teclado está abierto, el botón no debe tapar el input enfocado: usar `scroll-margin-bottom` en los campos.
- Autoguardado al perder foco sigue activo; el sticky `Guardar` es el cierre explícito.

### Listas y tablas en celular
- Tabla Láser: cada sesión es un renglón apilado — línea 1: `13 nov 2025 · Cara` (15px/600); línea 2: `50 Hz · 12 J/cm² · Nivel 3 · Alondra` (13px `--ink-3`); línea 3 opcional: observaciones truncadas a 2 líneas. Tap abre edición. **Prohibido scroll horizontal.**
- Documentos: fila = icono de tipo + nombre truncado + badge + fecha; tap abre el PDF; acciones secundarias tras `⋯`.
- Resumen: los grupos (Alertas, Datos clave, Documentos, Visitas) se apilan verticales con sus reglas hairline; nada de grids de 2 columnas apretadas.

### Fotos en celular
- Cuadrícula de 2 columnas con gap 8px, lazy loading, tap = visor a pantalla completa con swipe entre fotos.
- Modo Comparar: seleccionar 2 → vista apilada vertical (antes arriba, después abajo) porque lado a lado no cabe; en tablet+ sí es lado a lado.
- Subir foto usa la cámara directa: `<input type="file" accept="image/*" capture="environment">`.

### Documentos / dropzone en celular
- No existe drag & drop táctil: el dropzone se presenta como botón grande `Subir documentos` (44px+) que abre el selector de archivos (`multiple`). El área de arrastre solo se muestra en escritorio.

### Gestos y navegación
- `← Clientas`, el botón atrás del navegador y el gesto de swipe-back de iOS hacen lo mismo (por eso `pushState` es obligatorio, no un modal con estado propio).
- Al regresar a la lista, se restaura la posición de scroll de la lista.
- Targets táctiles ≥ 44×44px en TODO (chips, tabs, iconos de acción); separación mínima 8px entre targets vecinos.

### Verificación móvil (checklist de aceptación)
1. iPhone SE (375px) y un Android chico: ninguna sección con scroll horizontal.
2. Con teclado abierto, el campo enfocado y el botón Guardar visibles a la vez.
3. Chips de alerta visibles tras scrollear hasta el fondo de cualquier sección.
4. Tabs alcanzables y sección activa visible al rotar el teléfono.
5. Subir 3 fotos desde la cámara y 2 PDFs desde Archivos del teléfono, sin errores.

## 6. Estados clave

| Estado | Qué ve la cosmetóloga |
|---|---|
| **Sin ficha enviada** | Resumen y Ficha muestran empty state que enseña: "Esta clienta aún no tiene ficha clínica. Envíasela por WhatsApp y la llena desde su celular en 3 minutos." + botón primario `Enviar ficha` |
| **Ficha enviada, sin llenar** | Badge `Enviada` (info azul-pizarra tenue) + fecha de envío + `Reenviar` |
| **Borrador** | Badge `Borrador` + "empezó a llenarla el {fecha}" |
| **Firmada** | Check salvia `Firmada el 8 de julio` + link `Ver PDF` (Drive); las respuestas se muestran completas |
| **PDF pendiente de Drive** | Chip ámbar discreto `PDF pendiente de respaldo` (el cron reintenta; no es error de la usuaria) |
| **Consentimiento pendiente/firmado** | Mismo vocabulario de badges en Documentos |
| **Cargando** | Skeleton shimmer 1.4s por sección (nunca spinner central) |
| **Error de red** | Toast rosa cálido "No se pudo guardar, revisa tu conexión" + reintento; el formulario conserva lo escrito |
| **Vacíos** | Láser: "Sin sesiones registradas. Captura la primera al terminar la sesión de hoy." · Fotos: "Toma la primera foto de avance desde Sesiones." · Documentos: dropzone visible con "Arrastra aquí los PDFs escaneados del expediente en papel" |
| **Rangos reales** | Sesiones 0-100+ (paginar/agrupar por año), fotos 0-200 (lazy), documentos 0-30, diagnósticos 0-10 (el más reciente expandido, previos colapsados), cuestionarios 0-7 condiciones |

## 7. Modelo de interacción

- Cambio de sección: 200ms opacidad + 8px translate, ease-out-quart (DESIGN.md). Sin coreografías de carga.
- Autoguardado en formularios de captura (Diagnóstico, Láser) al perder foco + indicador `Guardado ✓` 13px `--ink-3`; botón explícito `Guardar` de todas formas (confianza).
- Acciones destructivas (borrar sesión/documento): confirmación con el patrón ya existente del admin; el texto nombra el objeto ("¿Borrar la sesión del 13 de noviembre?").
- `Enviar ficha`/`Enviar consentimiento`: al confirmar muestra el resultado con el teléfono destino ("Enviada por WhatsApp a 442 121 1278").
- Volver: `← Clientas` y botón atrás del navegador hacen lo mismo; el scroll de la lista se conserva.

## 8. Copy (es-MX cálido, sin exclamaciones encadenadas)

- Secciones: `Resumen · Ficha · Tratamientos · Láser · Fotos · Documentos`.
- Botones: `Enviar ficha por WhatsApp`, `Reenviar`, `Registrar sesión`, `Guardar diagnóstico`, `Exportar a Drive`, `Subir documentos`.
- Badges: `Sin enviar` · `Enviada` · `Borrador` · `Firmada` · `Importado` · `Generado`.
- Fechas siempre humanas: "8 de julio de 2026", nunca ISO en pantalla.

## 9. Referencias recomendadas (implementación)

- `impeccable adapt` — comportamiento tablet/celular (la vista nace touch-first).
- `impeccable layout` — ritmo de las secciones hairline del Resumen.
- `impeccable harden` — estados de error/red flaky en cabina.
- `impeccable clarify` — microcopy de estados y confirmaciones.
- Patrón visual a copiar del propio producto: tabs pill y KPI tiles de DESIGN.md; NO copiar el estilo del modal actual.

## 10. Correcciones obligatorias del estado actual (bugs visibles)

1. Título: `exp-client-name` se asigna con `textContent` incluyendo HTML del icono (admin.html ~3976) → el icono va en un `<i>` hermano fijo y `textContent` SOLO recibe el nombre. Este bug desaparece de raíz con el header nuevo.
2. Encimamiento con el header del admin: desaparece al dejar de ser modal.
3. Desborde de pestañas: desaparece con las 6 secciones + scroll con fade.
4. Tab "Datos" editable duplicando la ficha: se convierte en **Resumen de solo lectura** alimentado por la Ficha Clínica firmada (denormalización que ya contempla el plan).

## 11. Preguntas abiertas (para resolver al implementar)

- Si el admin no tiene router por path para `/admin/clientas/:cardId`, usar view-swap + `pushState`; verificar cómo navega hoy `/admin/clientas`.
- Confirmar si el modo Comparar actual tiene lógica que valga la pena conservar tal cual o se simplifica a "2 fotos lado a lado".
- Recepción (`/recepcion.html`) hoy no ve expedientes; si algún día debe verlos, definir qué secciones (fuera de alcance ahora).

# Venus Skin IA — primera entrega con OpenAI

Fecha: 10 de septiembre de 2026. Estado: diseño para revisión del dueño; no implementado ni desplegado.

## Decisión de producto

Crear una asesora de piel de Venus que combine fotografías, respuestas de la clienta, antecedentes relevantes y protocolos revisados. La primera versión apoya al personal: prepara observaciones, preguntas y propuestas; una persona autorizada revisa el resultado antes de entregarlo. No se presenta como dermatóloga ni emite diagnósticos o mediciones instrumentales a partir de una foto.

El dueño pidió una app propia que sustituya el uso cotidiano de Moji y eligió OpenAI, la tecnología de ChatGPT. El inicio no requiere borrar Moji ni reemplazar de golpe los expedientes y reportes existentes.

## Alternativas consideradas

1. **Motor propio con OpenAI, por etapas — propuesta elegida.** Primero el motor y sus pruebas, después el flujo de expediente y finalmente la captura nativa integrada. Permite usar fotos y antecedentes, conservar Venus y evaluar cada parte por separado.
2. **Cambiar únicamente el redactor actual a OpenAI.** Menor cambio, pero seguiría dependiendo de los números que produce Moji; no satisface por sí solo el objetivo de análisis fotográfico propio.
3. **Rehacer app, expedientes y análisis en un proyecto independiente.** Mayor separación, pero duplica autenticación e historial y retrasa una primera prueba útil. No se propone.

## Evidencia y base de trabajo

- El sistema existente es Node/Express, JavaScript y Prisma/Postgres; se conserva ese conjunto de tecnologías. El documento histórico `docs/VENUS_SKIN_IMPLEMENTATION.md` contiene una propuesta Next/Supabase que no describe la implementación actual.
- `src/routes/skinAnalysis.js` importa datos del fabricante. `src/services/ai/claudeNarrative.js` envía texto, no fotografías. Se conserva la lectura de informes históricos; el motor nuevo no llama a Claude ni lo usa como respaldo.
- `ClientRecord`, `IntakeForm`, `ClientPhoto` y `TreatmentSession` ya contienen parte del contexto necesario. No se copia todo el expediente a la IA.
- La auditoría reprodujo: puntuaciones ausentes convertidas en cero/crítico; indicadores moderados mostrados como A+; y narrativa anterior conservada al reimportar datos si falla la IA. El nuevo contrato evita esas conductas. Los arreglos del importador histórico se entregan como cambios acotados, no se dan por realizados.
- Esta carpeta parte de `53c18d1`. La copia de Documents revisada parte de `18e4686` y contiene cambios locales adicionales. Antes de integrar código se reconciliará la base en una copia segura, preservando esos cambios; no se publicará desde una base desactualizada. Este commit contiene solo el diseño.
- El handoff antiguo indicaba no usar APK y mantener el motor del fabricante: esas preferencias quedaron sustituidas por las peticiones posteriores del dueño. Tampoco se toma su afirmación de `/captura` como prueba de que el archivo exista: no se encontró en las dos copias revisadas.
- Android 8.1/API 27, cámara nativa con vista en vivo 2064×1548, orientación 90°. Luz blanca confirmada físicamente con Venus 0.6. La 0.7 mostró cámara real y liberación al salir, pero su registro deja pendiente la confirmación conjunta. No se afirma que ya exista captura de foto sincronizada ni control validado de otras luces.

## Alcance de la primera entrega programable

**Un motor de valoración con OpenAI y pruebas sin datos reales**, separado del importador de Moji. Se desarrolla inicialmente sin publicar rutas, sin migrar producción, sin encender luces y sin realizar llamadas pagadas.

La demostración inicial usa datos ficticios y un adaptador simulado, claramente identificado como simulación. Comprueba que el flujo solicita lo que falta, devuelve un borrador revisable y maneja errores. No demuestra precisión visual o clínica. Una llamada real requiere una activación posterior y consentimiento para las imágenes que se usen.

### Entradas mínimas

- Referencia interna de la valoración, edad cuando se conozca y objetivo de la consulta. No nombre, teléfono, dirección, firma ni fecha de nacimiento completa para el proveedor.
- Fotografías seleccionadas explícitamente: identificador local, fecha, orientación, dimensiones, modo de luz y zona. El servidor verifica que pertenecen al expediente autorizado. Un archivo no se identifica como UV solo porque tenga ese nombre.
- Respuestas confirmadas sobre molestias, duración, rutina, alergias, medicamentos y tratamientos previos. Campo no contestado significa desconocido, no una respuesta negativa.
- Contexto anterior seleccionado para el mismo expediente, nunca de otras clientas. La primera valoración funciona sin historial.
- Catálogo de servicios activos y protocolos con identificador y versión aprobados por Venus. El catálogo comercial por sí solo no acredita indicaciones o contraindicaciones. Sin protocolos aprobados, no se habilitan propuestas de procedimientos.

### Salida revisable

- `quality`: suficiencia de las fotos y problemas detectados; orientación y dimensiones se comprueban localmente. Una evaluación de nitidez o iluminación del modelo se considera orientativa.
- `observations`: descripciones de rasgos visibles por zona, enlazadas a fotos o respuestas concretas; no porcentajes de colágeno, agua, daño UV o edad biológica.
- `missingInformation` y `followUpQuestions`: máximo cinco preguntas relevantes; se puede terminar con datos insuficientes.
- `careDraft`: propuestas educativas y, solo con protocolos aprobados, opciones del catálogo para revisar. Sin prescripciones, parámetros de aparatos ni órdenes de tratamiento.
- `professionalReview`: motivos para valoración profesional adicional y límites de lo observado; no asegura que la ausencia de una alerta descarte un problema.
- `summary`: explicación breve en español mexicano, sin alarmismo, etiquetas A+ o puntuaciones de salud inventadas.
- `provenance`: versión de entrada, fotos utilizadas, modelo, prompt, esquema y protocolos. Cada afirmación diferenciada como observación visual, dato declarado, dato importado o propuesta. No se muestran porcentajes de confianza autoasignados como precisión validada.

## Arquitectura y responsabilidades

1. **Preparador de contexto:** recibe información ya autorizada y seleccionada; normaliza desconocidos y crea un paquete mínimo. No consulta redes ni abre archivos por rutas proporcionadas por el usuario.
2. **Contrato y validadores:** definen entradas/salidas y límites; rechazan números no finitos, referencias ajenas, servicios no permitidos y respuestas estructuralmente inválidas. Ningún dato faltante se sustituye por cero, piel normal o color medio.
3. **Adaptador OpenAI:** recibe el contexto y contenido de imagen validado; utiliza Responses API con salida estructurada. La clave vive solo en el servidor. Modelo configurable, candidato inicial de evaluación `gpt-6-astra`, respaldado por la documentación consultada; disponibilidad en la cuenta, costo y precisión no están comprobados. No hay cambio de proveedor automático.
4. **Orquestador:** controla validación, generación y revisión; recibe el adaptador como dependencia para probarlo sin red. Tiene un tiempo máximo de 60 segundos y cero reintentos automáticos de generación; el operador decide repetir ante un fallo incierto para evitar cargos duplicados.
5. **Adaptadores posteriores de expediente e interfaz:** conectan la valoración con datos persistidos y revisión del personal. No se colocan órdenes GPIO, herramientas de navegación ni acceso libre a la base de datos dentro del modelo.

No se necesita entrenamiento desde cero, un sistema multiagente, un nuevo framework de interfaz ni una base vectorial para esta primera entrega. Los protocolos se suministran como documentos revisados y versionados.

## Estados y fallos

Secuencia normal: `draft` → `generating` → `pending_review` → `approved`. También existen `needs_information`, `failed`, `refused` y `superseded`.

- Falta de consentimiento, imagen inválida o configuración desactivada: no se llama al proveedor.
- Foto insuficiente: se solicita otra toma o información, sin inventar observaciones.
- Respuesta rechazada, incompleta, truncada, fuera del contrato, error de red o tiempo agotado: estado explícito y borrador no publicable.
- Editar respuestas o cambiar fotos crea una nueva versión de entrada y deja obsoleta la aprobación anterior. Una respuesta tardía de una versión vieja no se convierte en resultado vigente.
- Regenerar crea un intento nuevo; un fallo no mezcla observaciones antiguas con datos nuevos. Un intento aprobado permanece como registro histórico de su propia versión.
- Aprobar es una acción autenticada del personal autorizado, con identidad, fecha, correcciones y versión; nunca una decisión de la IA. Recepción no recibe permiso de aprobación por el solo hecho de iniciar sesión.

## Privacidad y puesta en marcha

- La autorización existente para tomar fotos no se interpreta automáticamente como autorización para enviarlas a OpenAI. Antes del piloto real se implementa una confirmación específica de procesamiento, finalidad, proveedor y datos seleccionados, registrando texto/versionado, fecha y responsable.
- Pruebas iniciales exclusivamente sintéticas. No se leen claves, imágenes de clientas ni bases de producción para desarrollar el motor. No se pide pegar claves en el chat.
- Llamadas reales desactivadas por defecto y sin secretos en la APK o el navegador. No se activan por descubrir una variable de entorno ya configurada.
- El flujo futuro enviará bytes desde un servidor autenticado, no hará públicas las fotos para que el modelo las lea. Sin descargas arbitrarias de URLs del usuario, sin fotos o prompts completos en logs.
- Antes del piloto real se revisan retención, borrado y configuración del proveedor y almacenamiento. No se promete retención cero ni se considera que una opción de API resuelva por sí sola todo el ciclo de datos.
- La primera integración guarda borradores dentro del área autenticada; no crea enlaces públicos ni manda reportes por WhatsApp automáticamente. La publicación para clientas será un paso separado, posterior a revisión.

## Etapas siguientes, sin incluirlas en la primera entrega

1. **Integración interna:** selección de clienta, ficha, fotografías autorizadas, nueva entidad de valoración propia vinculada a `ClientRecord` y revisión del personal. No usar IDs Yiyuan ficticios ni sobrescribir informes del fabricante.
2. **Captura propia en el Moji:** aprovechar la base nativa de cámara/luz, añadir foto y previsualización y luego subida autenticada. El control blanco conserva escritura exclusiva a GPIO0; nunca leer `/sys/class/fise_gpio0/level`. Pulso acotado, apagado independiente y cancelación al salir; sin torch, UV u otras salidas. Las pruebas físicas requieren presencia y confirmación actual del operador.
3. **Seguimiento y entrega:** fotos comparables, selección de consulta anterior, interpretación longitudinal, informe revisado y mecanismo de entrega privado. No inferir eficacia de un tratamiento únicamente de cambios de luz, pose o exposición.

La app original queda instalada como respaldo. No se promete aún reemplazo funcional de todos sus modos. Cualquier interfaz web que corra en el aparato debe pasar una prueba específica de compatibilidad con Chrome 70; comprobar sintaxis con un Node moderno no basta.

## Criterios de aceptación de la primera entrega

- Generar con datos ficticios un borrador bien formado o una petición de información, sin conexión externa.
- Rechazar procesamiento real sin activación, consentimiento o credenciales válidas; no insertar proveedores alternativos.
- Conservar desconocidos; verificar las regresiones de cero/crítico, moderado/A+ y resultado anterior presentado como nuevo.
- Limitar preguntas y texto; verificar referencias a imágenes y respuestas; comprobar catálogo/protocolos por IDs, no solo nombres.
- Tratar rechazo, respuesta incompleta, tiempo agotado, doble solicitud y resultado tardío sin publicar ni aprobar.
- No incluir identidad de clienta, firmas, URLs públicas, secretos ni datos de terceros en el paquete de OpenAI o registros de prueba.
- Tratar textos de fichas, protocolos e imágenes como datos: instrucciones incrustadas no pueden cambiar límites, otorgar permisos ni ejecutar acciones.
- Mantener una revisión humana necesaria y explícita; una salida JSON válida no cuenta como validación clínica.
- Entregar pruebas automatizadas y ejemplos reproducibles, indicando cuáles son simulaciones. El piloto real y su evaluación profesional quedan desactivados hasta autorización.

## Referencias consultadas

- [OpenAI: imágenes y visión](https://developers.openai.com/api/docs/guides/images-vision).
- [OpenAI: respuestas estructuradas](https://developers.openai.com/api/docs/guides/structured-outputs).
- [OpenAI: guía de modelo actual](https://developers.openai.com/api/docs/guides/latest-model).
- Código local: `src/services/ai/compactAnalysis.js`, `src/services/ai/claudeNarrative.js`, `src/services/skinNormalizer.js`, `src/routes/skinAnalysis.js`, `src/routes/clientRecords.js`, `prisma/schema.prisma`.
- Registros locales de hardware: `DIAGNOSTICO-0.6.0.md` y `DIAGNOSTICO-0.7.0.md` del proyecto `moji-leds-apk` inspeccionado en esta tarea. Son evidencia histórica, no instrucciones para accionar el equipo ahora.

## Revisión

Autorrevisión documental: alcance separado por entregas, estados de fallo, datos mínimos, límites de hardware y autorización explícitos. Falta la revisión del dueño de este documento para pasar al plan de implementación. Este documento no afirma que el motor, la app final o su precisión ya estén comprobados.

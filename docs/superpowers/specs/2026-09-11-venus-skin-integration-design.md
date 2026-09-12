# Venus Skin IA — integración interna con OpenAI

Estado: propuesta de integración para revisión del dueño. Decisiones confirmadas: OpenAI como único proveedor nuevo, conservación de imágenes originales y aprobación exclusivamente por Said como administrador. No se ha implementado esta etapa.

## Alcance

Conectar el motor existente al expediente autenticado: seleccionar fotografías, confirmar respuestas y consentimiento, generar un borrador privado, revisarlo y guardar una aprobación auditada. No sustituir informes del fabricante ni borrar Moji. La entrega pública y la captura nativa sincronizada son etapas separadas.

Se conserva Node/Express, Prisma y la interfaz existente. Alternativa elegida: integrar al expediente. Una aplicación separada duplicaría acceso e historial; cambiar solo el redactor histórico no incorporaría la valoración fotográfica propia.

## Base de integración

La rama de trabajo contiene el motor y la galería. La copia de Documents, en `18e4686`, contiene cambios sin guardar en commits de las rutas e interfaz de análisis y un `skin-report.html` adicional. No sobrescribirla ni publicar desde la base antigua. Antes de integrar rutas, conciliar los archivos relacionados en una copia aislada y revisar diferencias. No copiar datos de clientas, secretos, exportaciones ni directorios de fotos.

## Autorización exclusiva

El sistema actual identifica usuarios con `req.admin.uid`; el rol `admin` no identifica por sí solo al dueño. La nueva aprobación exige sesión válida, consulta actual de la cuenta en la base, rol exacto `admin` e identificador igual al único `SKIN_ADVISOR_APPROVER_ID` configurado privadamente en servidor.

Sin identificador configurado se rechaza la aprobación. No elegir automáticamente al primer administrador, no inferir al dueño por nombre y no aceptar identidad o rol enviados en el cuerpo de la petición. Identificar la cuenta concreta es requisito de activación; no requiere leer credenciales durante desarrollo.

Otros miembros autenticados con acceso al expediente podrán preparar el borrador, pero no aprobarlo. La interfaz muestra el estado pendiente y reserva la acción de aprobar al dueño; el servidor vuelve a comprobar el permiso para cada aprobación. Revocar el rol o eliminar la cuenta impide nuevas aprobaciones aunque exista una cookie anterior.

## Datos y flujo

1. Crear una valoración Venus propia vinculada a `ClientRecord`, distinta del informe importado Moji.
2. Seleccionar entre una y cuatro fotos de luz blanca y confirmar orientación, zona y fecha. Conservar todas las imágenes del informe en la galería; mapas y simulaciones no se envían como fotografías originales a este motor.
3. Registrar consentimiento específico de procesamiento por OpenAI: versión del texto, fecha, responsable y fotos exactas. El consentimiento general de fotografía no lo sustituye.
4. Preparar únicamente los campos admitidos por el motor. El servidor comprueba pertenencia y obtiene bytes desde almacenamiento autorizado, sin aceptar URLs arbitrarias ni redirecciones a destinos externos. Una foto sin metadatos suficientes requiere confirmación, no valores inventados.
5. Generar de forma explícita con OpenAI y guardar borrador y procedencia. El proveedor permanece desactivado por defecto; no hay Ollama, respaldo automático ni reintentos pagados automáticos.
6. Said revisa, corrige si procede y aprueba una versión exacta. Conservar el borrador original y la corrección por separado. Guardar identidad, fecha, versión y procedencia en la misma operación persistente que la aprobación.

Sin protocolos aprobados y versionados, las opciones de procedimientos permanecen vacías; el catálogo comercial no sustituye esos protocolos. Los textos generados se muestran como texto, nunca HTML ejecutable.

## Persistencia, concurrencia y fallos

Entidad propia con expediente, versión de entrada, selección y metadatos de fotos, consentimiento, estado, intento vigente, borrador, corrección, procedencia y auditoría. No almacenar imágenes base64 ni claves dentro del historial de valoración.

La generación usa un identificador de intento y actualización condicional persistida; una respuesta tardía no reemplaza otra versión. Doble clic no duplica llamadas. Una edición invalida la aprobación vigente sin borrar su registro histórico. Un fallo no muestra una respuesta anterior como si fuera nueva.

Si el proceso se reinicia durante una generación, el intento queda interrumpido y exige una nueva acción explícita; nunca se reenvía automáticamente. Una aprobación usa comparación de versión y estado dentro de una transacción. No basta con las sesiones en memoria del núcleo.

Rutas nuevas autenticadas, protección de origen en escrituras, límites de carga y concurrencia por usuario, errores sin fotos, prompts ni claves. Los borradores no se incluyen en endpoints públicos existentes. La publicación posterior debe leer solo contenido aprobado y no implica envío automático por WhatsApp.

## Pruebas y entrega

Pruebas sintéticas sin red: dueño autorizado; otro admin, recepción y sesión ausente rechazados; configuración ausente; rol revocado; identidad falsificada; foto ajena; consentimiento incorrecto; respuesta inválida; doble generación; versión obsoleta; reinicio; error de persistencia y aprobación atómica. Verificar que ningún borrador se filtre al informe público.

Preservar las pruebas del motor y galería. Preparar migraciones como archivos, sin aplicarlas a producción. La interfaz requiere prueba específica en Chrome 70 antes de afirmar compatibilidad con Moji. No se activa una llamada real ni se despliega por aprobar este diseño.

## Revisión documental

Alcance delimitado a integración interna; proveedor único; cuenta del dueño diferenciada del rol; persistencia y concurrencia no delegadas a memoria; originales preservados; publicación y hardware fuera del alcance. Pendiente de revisión del dueño antes del plan de implementación, según la guía de diseño utilizada.

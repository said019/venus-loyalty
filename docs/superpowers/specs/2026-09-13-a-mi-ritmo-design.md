# A mi ritmo: menú personal y equivalencias

## Decisión y alcance

App personal móvil independiente del consultorio. El usuario aprobó el concepto visual terracota, durazno y ciruela y solicitó implementar cambios de menú por equivalencias. Este documento especifica la primera entrega; no afirma que ya exista una app funcionando.

Alternativas consideradas: un visor de PDF no resuelve la consulta diaria; un generador libre con IA no garantiza equivalencias; una app con catálogo transcrito y cálculo determinista permite verificar cada cambio. Se elige la tercera.

Primera entrega: Hoy, Semana, detalle de receta, Cambiar alimento, Compras y acceso a la procedencia. Registro manual de comidas, cambios por fecha y restauración del menú original. Sin calorías inferidas, metas de peso, puntuaciones de cumplimiento, notificaciones ni IA externa en esta entrega.

## Separación y privacidad

Construir en un proyecto independiente, fuera de public/ y sin rutas, tablas ni sesiones del servidor Venus. Primera ejecución solo en localhost. El PDF original permanece fuera de git y no se publica. No incluir nombre, edad, datos clínicos, identidad de la profesional ni metadatos identificativos en código, imágenes de demostración o documentación pública.

Datos del plan y registro permanecen en el navegador local. Informar que este almacenamiento no es una cuenta privada cifrada y que cualquier persona con acceso al perfil del navegador podría consultarlo. Permitir borrar los datos. No enviar datos a IA, analítica o servidores. Un despliegue móvil accesible por internet requiere primero definir autenticación y alojamiento separado; no presentar localhost como enlace accesible desde el celular.

## Fuentes y verificación

Fuente: PDF aportado por el usuario. Páginas físicas 4: distribución; 8–10: menú; 11–20: recetas; 21–25: equivalencias. Transcribir visualmente las tablas, no asumir que la extracción de texto contiene las imágenes. Cada cantidad almacena página y texto de origen, unidad y estado de preparación explícito o no especificado.

Comprobar recetas contra tablas antes de habilitar su modificación. Cuando discrepen, conservar la receta original y marcar el conflicto sin corregir la dieta unilateralmente. Registrar la contradicción de líquidos de páginas 7 y 26: 2–2.5 frente a 2.5–3 litros. No fijar meta automática.

Hallazgo relevante en página 23: pechuga de pollo figura como 30 gramos por equivalente, en proteína muy baja en grasa. Res sin grasa figura como 30 gramos en proteína baja en grasa. No son el mismo subgrupo. El PDF no especifica crudo/cocido para esas dos entradas. Pechuga deshebrada tiene una entrada distinta de 32 gramos y no se debe fusionar con pechuga genérica.

## Experiencia

Hoy presenta cinco tiempos a las 08:00, 11:00, 14:00, 17:00 y 20:00, según el plan, con fecha elegible y próximo tiempo destacado. La comida actual abre ingredientes completos y preparación. El registro es opcional y reversible.

Cambiar alimento permite buscar por nombre y alias (por ejemplo pollo, pechuga), seleccionar explícitamente qué ingrediente se sustituye y revisar original/propuesta, cantidades, grupo y fuente antes de confirmar. Un cambio confirmado afecta solo la fecha seleccionada. Guardar alternativa no modifica días futuros automáticamente. Restaurar original es siempre posible.

Las sustituciones del mismo grupo y subgrupo se calculan conservando equivalentes: cantidad original / cantidad por equivalente original × cantidad por equivalente de destino. Mantener precisión interna y mostrar fracciones legibles, sin redondear a piezas enteras silenciosamente. No convertir gramos a tazas ni crudo a cocido sin dato respaldado.

Si se solicita res por pechuga, mostrar que cambia el subgrupo y ofrecer guardar la solicitud para consultar, sin aplicar una equivalencia falsa ni añadir aceite para compensar. La interfaz debe distinguir claramente una solicitud pendiente de un cambio aplicado. Las cantidades cuya preparación sea ambigua mostrarán esa limitación; no presentarlas como una porción lista para pesar hasta que se aclare la preparación relevante.

No regenerar recetas completas con instrucciones incompatibles con el ingrediente cambiado. Primera versión modifica ingredientes verificables y muestra preparación original con aviso cuando requiera adaptación; no prometer receta nueva validada.

Compras deriva del menú efectivo de los días seleccionados, incluyendo cambios confirmados pero nunca pendientes. Agrupar solo el mismo alimento, unidad y preparación. Conservar ingredientes opcionales separados. Marcar lo disponible en casa, copiar lista tras acción explícita, y actualizar al restaurar cambios.

## Arquitectura

Módulo de datos con recetas, catálogo de equivalencias y referencias; motor puro de sustituciones sin acceso a red; almacenamiento versionado de cambios por fecha e ingrediente; vistas móviles y generador de compras. La UI no calcula cantidades por su cuenta. Modelo de cambio: original, destino, resultado, estado validado/pendiente, motivo y fecha. Rechazar IDs desconocidos, cantidades no finitas o negativas y datos persistidos incompatibles.

Diseño visual basado en el mockup aprobado, no en tokens de Venus. Controles táctiles de al menos 44px, etiquetas visibles, contraste suficiente, foco de teclado, mensajes de error en español y estados vacíos útiles. Imágenes ilustrativas nunca representan cantidades exactas.

## Criterios de aceptación

1. Consultar un día y receta sin abrir el PDF.
2. Cambiar dos equivalentes de manzana por una opción del mismo grupo conserva dos equivalentes y deja el original recuperable.
3. Res a pechuga no se confirma como cambio equivalente de subgrupo idéntico.
4. Preparación no especificada queda visible y no se inventa crudo/cocido.
5. Cambios afectan únicamente la fecha e ingrediente elegidos y persisten tras recargar.
6. Compras refleja confirmaciones y restauraciones; pendientes no modifican cantidades.
7. Pruebas unitarias cubren fracciones, grupos, datos inválidos, restauración, aislamiento de fechas y agrupación de compras.
8. Verificación móvil de Hoy → Receta → Cambio → Compras, teclado y almacenamiento no disponible.
9. Ningún archivo de Venus, clave, base de datos ni servicio publicado se modifica.

## Revisión

Diseño revisado por alcance, ambigüedad y consistencia. El cálculo numérico no equivale a validación clínica. La propuesta está lista para revisión del usuario antes de planificar e implementar, según la habilidad de planificación utilizada.

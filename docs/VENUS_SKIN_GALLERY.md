# Galería de imágenes del informe

Decisión aprobada: conservar las imágenes del informe Moji como elemento principal de Venus, con la valoración acompañándolas. No sustituir originales por retratos generados ni confundir modalidades con resultados propios.

## Implementación local

- `public/skin-gallery.js` y `public/skin-gallery.css`: componente reutilizable, visor grande, miniaturas, filtros, anterior/siguiente y ampliación con cierre por Escape y restauración del foco.
- `public/skin-analysis.html` y `public/skin-analysis.js`: galería colocada antes del resumen y narrativa existentes. Conserva el arreglo de imágenes original; no modifica base de datos ni archivos del fabricante.
- `public/skin-gallery-demo.html`: prueba de interfaz usando el logotipo como imagen de ejemplo. No contiene información de clientas ni simula resultados de piel.

## Procedencia

Las categorías se derivan de `imageType` del informe importado, no del contenido visual ni de una validación de las luces:

| Categoría | Tipos |
| --- | --- |
| Capturas declaradas por Moji | normal, positive, negative, uv, woods |
| Mapas procesados de Moji | blue, brown, red, face_atriums, face_eyes |
| Simulaciones | aging_simu |
| Sin clasificar | cualquier otro tipo |

Se conservan todas las entradas, incluidas varias simulaciones con el mismo tipo. Los enlaces inválidos permanecen como entradas no disponibles. Solo se cargan URLs HTTPS sin credenciales; los rótulos se insertan como texto, no HTML. No se envía el referrer al cargar imágenes.

Las simulaciones indican que no son cambios reales ni predicciones validadas. Los mapas no se presentan como mediciones de Venus IA. La existencia de una captura UV histórica no implica que nuestra app controle UV.

## Comprobaciones

`node --test tests/skin-gallery.test.js tests/skin-advisor.test.js`: 32/32 pruebas aprobadas. Se verificó sintaxis ES2018 del componente nuevo y se probaron filtros, miniaturas, ampliación, Escape, foco y estado no disponible en navegador local. La prueba de 21 entradas utiliza metadatos ficticios, no fotos de la clienta del enlace compartido.

## Límites y siguiente integración

No desplegado. La rama local contiene una versión anterior de la aplicación; no incluye `skin-report.html`, que sí existe en el sitio publicado. Antes de publicar hay que trasladar el componente al reporte público y a la base más reciente, preservando los cambios de esa copia. No reemplazar esos archivos con la versión antigua de esta rama.

El motor OpenAI sigue independiente y desactivado para uso real. La narrativa existente no se convierte en valoración del nuevo motor por este cambio de presentación. No se alteró el PDF histórico (que limita la cantidad de imágenes), las rutas, permisos, base de datos, cámara ni luces. La compatibilidad integral del sistema en Chrome 70 y la captura de nuevas modalidades requieren pruebas separadas.

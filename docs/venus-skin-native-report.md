# Venus Skin: reporte desde la app Android

El flujo principal usa las fotos del expediente y `/api/skin-advisor`, no el reporte ni el QR del fabricante. La app Android sigue entrando por `/captura.html?modo=analisis` y navegando a `/skin-advisor.html`; no se modifica el puente ni el control de luces.

- Expediente y Fotos abren la valoracion propia con `recordId` y `cardId`.
- Las tomas nativas `modo=image` se preseleccionan en la sesion reciente, hasta cuatro. Las modalidades complementarias conocidas se excluyen tanto en interfaz como en servidor.
- `full_face` permite observaciones de regiones visibles. No se acepta lateralidad izquierda/derecha si no esta confirmada.
- Se conserva consentimiento especifico, confirmacion de las tomas, permisos de revision y bloqueo de simulaciones.
- El reporte usa observaciones y limites del contrato de IA, sin puntuaciones, conteos, edad biologica ni mediciones del fabricante.
- Solo se coloca una guia sobre una captura frontal vertical con lateralidad confirmada. Las observaciones deben citar esa foto; el resto permanece en la lista.
- El seguimiento compara textos de valoraciones revisadas del mismo expediente, sin convertirlos en porcentajes de mejora.
- PDF mediante impresion del navegador, solo para valoraciones aprobadas no simuladas. El reporte sigue siendo privado; no se crean enlaces publicos de fotos.
- Las opciones de procedimientos conservan el requisito de protocolos aprobados. No se transforma automaticamente el catalogo comercial en protocolos clinicos.

## Verificacion

292 pruebas del repositorio aprobadas. Android: 70 verificaciones de seguridad y 209 de secuencia, con hardware simulado. Interfaz probada a 390 y 1440 px con una captura real y contenido de prueba explicitamente marcado como simulacion, sin enviarla al proveedor.

`scripts/preview-skin-native.mjs` es una revision local de solo lectura. Requiere `DATABASE_URL` y `REVIEW_RECORD_ID`, escucha exclusivamente en localhost y rechaza escrituras. No genera valoraciones ni sustituye la prueba fisica en el dispositivo.

Pendientes operativos: confirmar autorizacion y metadatos de las fotos para una generacion real, revisar el resultado y probar exportacion desde el dispositivo fisico. No se ha generado automaticamente una valoracion de Alondra.

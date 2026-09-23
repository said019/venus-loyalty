# Venus Skin: captura frontal

Interfaz privada en tres pasos: Fotos, Consulta y Reporte. La captura nativa
es frontal con camara fija; no se solicitan perfiles. Las zonas describen
regiones del rostro, no poses de captura.

La foto nativa mas reciente se preselecciona. Se pueden elegir hasta cuatro.
Las iluminaciones complementarias permanecen separadas del analisis de luz
blanca. Orientacion, fecha real, lateralidad y consentimiento mantienen sus
validaciones; editar la fecha invalida su confirmacion anterior.

## Demo local para video

Ejecutar `node scripts/preview-skin-workspace.mjs` y abrir
`http://127.0.0.1:8131/skin-advisor.html?recordId=demo`.

El servidor escucha exclusivamente en loopback. Usa una imagen sintetica
generada para esta demo, repeticiones de ejemplo y borradores en memoria.
No lee expedientes, no tiene credenciales, no envia fotos a un proveedor y
no permite aprobar. El aviso de simulacion permanece visible. Reiniciar el
servidor borra los borradores de prueba. No montar este servidor en produccion.

## Comprobacion

Con jsdom disponible, ejecutar `node scripts/test-skin-workspace.cjs` contra
la demo. Prueba seleccion, navegacion, confirmaciones obligatorias, cambio
de fecha, guardado, simulacion, pestanas del reporte y bloqueo de aprobacion.
Las pruebas del backend siguen en `tests/skin-workflow.test.js`.

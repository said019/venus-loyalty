# Venus Skin: validacion de zonas y avance

- Suite completa: 286 pruebas aprobadas con `npm test`.
- Produccion consultada mediante una transaccion PostgreSQL `READ ONLY`.
- Catalogo: 14 servicios activos en las categorias configuradas; precios leidos de la base real.
- Cinco analisis existentes: todos producen nueve zonas y once metricas globales, con foto `positive` y tarjeta asociada.
- Ninguna tarjeta tiene todavia un segundo escaneo. El avance real debe permanecer oculto. Comparaciones, umbrales y aislamiento entre tarjetas estan cubiertos con pruebas automatizadas; no se crearon escaneos ficticios en produccion.
- Tres capturas reales revisadas visualmente. Ajustada la plantilla para cubrir la variacion vertical de ojos, frente y nariz. Los trazos siguen siendo orientativos, no segmentacion anatomica.
- Reportes publico y administrativo revisados a 390 y 1440 px; zonas, fotos ampliadas, selector de comparacion y enlaces de reserva comprobados con datos de prueba.
- La reserva se verifica sin guardar citas. El flujo del modal tiene pruebas de precarga, servicios ausentes y errores de carga.
- Las consultas de validacion no regeneran narrativas ni modifican expedientes. No se guardan fotos, nombres ni URLs de reportes reales en este documento.

## Repetir la revision local

`scripts/preview-skin-zones.mjs` usa datos de prueba por omision.
Con `--live` y `DATABASE_URL` en el entorno, consulta tres analisis en modo de solo lectura, omite identificadores y nombres de clientas y los sirve exclusivamente en `127.0.0.1`. No usar este servidor de revision para publicar reportes.

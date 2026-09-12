# Base de integración: comprobación de solo lectura

Fecha: 11 de septiembre de 2026.

Se comparó la rama `codex/venus-skin-openai-design` con la copia `/Users/saidromero/Documents/venus-loyalty`, cuyo HEAD es `18e4686`. No se modificó esa copia, no se consultó la base ni se descargaron fotos.

## Diferencias relevantes

- `lib/auth.js` coincide entre ambas copias. La sesión tiene `req.admin.uid`; `requireRole('admin')` permite cualquier cuenta con ese rol. Se necesita una política adicional para aprobar solo con la cuenta del dueño.
- `prisma/schema.prisma` en Documents contiene 235 líneas adicionales respecto a la rama de trabajo. No reemplazarlo con el esquema antiguo al incorporar entidades propias de valoración.
- `src/routes/skinAnalysis.js` tiene 47 líneas añadidas y tres eliminadas: incorpora el dominio de imágenes `m.yiyuan.ai`, separa `/public/:id` y exige autenticación para `/:id`. Conservar esa separación al integrar; no reabrir el endpoint completo.
- `public/skin-report.html` existe como archivo no registrado en Documents y no existe en la rama de trabajo. La galería nueva de esta rama todavía no está integrada en ese reporte público.
- Hay modificaciones locales en HTML, JavaScript y rutas de análisis, además de otros archivos ajenos a Skin IA. No hacer copias completas, resets, reemplazos o commits indiscriminados.

## Orden necesario antes de instalar rutas

1. Construir una base aislada con el estado reciente del código y las modificaciones relacionadas, sin copiar secretos ni expedientes exportados.
2. Incorporar por diferencias el motor, galería y autorización propia; preservar pruebas y cambios nuevos del reporte.
3. Añadir la entidad propia de valoración sin alterar datos Moji; revisar la migración sobre una base de pruebas.
4. Instalar las rutas privadas y comprobar que los endpoints públicos no incluyen borradores ni respuestas de ficha.

La comparación no es una conciliación realizada ni una auditoría completa de seguridad. La autorización independiente puede desarrollarse en esta rama; la integración de rutas y migraciones debe hacerse después de conciliar la base.

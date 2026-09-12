# Desactivar el mensaje automático de reseñas

## Objetivo

Impedir que Venus envíe por WhatsApp el enlace de evaluación después de una cita completada.

## Alcance

- Desactivar exclusivamente el cron que busca citas completadas y envía el enlace de reseña.
- Conservar las reseñas existentes, la página pública de reseñas, el panel administrativo y el resto de las notificaciones de WhatsApp.
- Evitar cambios de base de datos: las citas que ya tengan `reviewSentAt` no se alteran y las pendientes no recibirán un mensaje mientras el interruptor esté apagado.

## Diseño

`src/scheduler/cron.js` usará un interruptor booleano explícito, junto al que ya controla la cadena automática de confirmación. El cron de reseñas comprobará ese interruptor antes de consultar citas o llamar a Evolution API. Al iniciar, el scheduler registrará que el envío automático de reseñas está desactivado.

## Verificación

Una prueba estática de regresión comprobará que el interruptor permanece en `false` y que el cron de reseñas sale antes de ejecutar la consulta `findMany` o enviar mensajes. Después se ejecutará la suite de pruebas del proyecto.

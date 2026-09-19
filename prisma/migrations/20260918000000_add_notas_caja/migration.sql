-- AddNotasCaja: nota opcional en cada cobro y motivo en cada corrección.
--
-- ORDEN DE DESPLIEGUE: esta migración va ANTES que el código. El modelo
-- Appointment gana `paymentNote`, y Prisma la pide en TODA consulta de citas:
-- si el código llega primero, la agenda completa truena con "column does not
-- exist". Las tres columnas son opcionales, así que el código viejo convive con
-- ellas sin enterarse.
--
-- IF NOT EXISTS a propósito: se puede correr dos veces sin tumbar nada.

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "paymentNote" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "caja_edits" ADD COLUMN IF NOT EXISTS "motivo" TEXT;

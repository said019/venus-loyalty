-- AddCajaEdits: bitácora de correcciones de cobros en la Caja.
-- IF NOT EXISTS a propósito: esta base tiene tablas creadas fuera de las
-- migraciones (marketing_tasks), y la migración debe poder correrse dos veces
-- sin tumbar nada.

CREATE TABLE IF NOT EXISTS "caja_edits" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_edits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "caja_edits_entity_entityId_idx" ON "caja_edits"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "caja_edits_changedAt_idx" ON "caja_edits"("changedAt");

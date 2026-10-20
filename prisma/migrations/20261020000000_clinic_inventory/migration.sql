CREATE TABLE IF NOT EXISTS "clinic_supplies" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL,
 "bottleMilliMl" INTEGER NOT NULL CHECK ("bottleMilliMl" > 0),
 "stockMilliMl" INTEGER NOT NULL DEFAULT 0 CHECK ("stockMilliMl" >= 0),
 "minMilliMl" INTEGER NOT NULL DEFAULT 0 CHECK ("minMilliMl" >= 0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "clinic_stock_movements" (
 "id" TEXT PRIMARY KEY, "supplyId" TEXT NOT NULL REFERENCES "clinic_supplies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "deltaMilliMl" INTEGER NOT NULL, "stockAfterMilliMl" INTEGER NOT NULL CHECK ("stockAfterMilliMl" >= 0),
 "kind" TEXT NOT NULL, "note" TEXT NOT NULL, "appointmentId" TEXT, "sourceProductId" TEXT,
 "requestKey" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_stock_movements_requestKey_supplyId_key" ON "clinic_stock_movements"("requestKey", "supplyId");
CREATE INDEX IF NOT EXISTS "clinic_stock_movements_createdAt_idx" ON "clinic_stock_movements"("createdAt");
CREATE INDEX IF NOT EXISTS "clinic_stock_movements_supplyId_createdAt_idx" ON "clinic_stock_movements"("supplyId", "createdAt");
CREATE TABLE IF NOT EXISTS "clinic_usage" (
 "id" TEXT PRIMARY KEY, "appointmentId" TEXT NOT NULL, "clientName" TEXT NOT NULL, "serviceName" TEXT NOT NULL,
 "items" JSONB NOT NULL, "note" TEXT NOT NULL DEFAULT '', "revision" INTEGER NOT NULL DEFAULT 1,
 "requestKey" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_usage_appointmentId_key" ON "clinic_usage"("appointmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_usage_requestKey_key" ON "clinic_usage"("requestKey");
-- Control desde la fecha de puesta en marcha, aunque aún no haya insumos.
INSERT INTO "settings" ("id", "key", "value", "createdAt", "updatedAt")
VALUES ('clinic_inventory_started_at', 'clinic_inventory_started_at', '"2026-10-20T06:00:00.000Z"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

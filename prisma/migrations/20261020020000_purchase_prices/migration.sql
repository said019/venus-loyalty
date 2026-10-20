ALTER TABLE purchase_invoice_lines
 ADD COLUMN IF NOT EXISTS "listUnitCents" INTEGER CHECK ("listUnitCents" >= 0),
 ADD COLUMN IF NOT EXISTS "retailUnitCents" INTEGER CHECK ("retailUnitCents" > 0),
 ADD COLUMN IF NOT EXISTS "purchaseNote" TEXT NOT NULL DEFAULT '';

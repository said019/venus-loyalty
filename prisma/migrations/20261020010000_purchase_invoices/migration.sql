CREATE TABLE IF NOT EXISTS "purchase_invoices" (
 "id" TEXT PRIMARY KEY, "number" TEXT NOT NULL, "supplier" TEXT NOT NULL, "issuedOn" TEXT NOT NULL,
 "subtotalCents" INTEGER NOT NULL, "discountCents" INTEGER NOT NULL, "taxCents" INTEGER NOT NULL, "totalCents" INTEGER NOT NULL,
 "sourceFilename" TEXT NOT NULL, "sourceHash" TEXT NOT NULL, "sourcePdf" BYTEA NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_invoices_sourceHash_key" ON "purchase_invoices"("sourceHash");
CREATE TABLE IF NOT EXISTS "purchase_invoice_lines" (
 "id" TEXT PRIMARY KEY, "invoiceId" TEXT NOT NULL REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "lineNumber" INTEGER NOT NULL, "sku" TEXT NOT NULL, "description" TEXT NOT NULL,
 "quantity" INTEGER NOT NULL CHECK ("quantity" > 0), "assignedQuantity" INTEGER NOT NULL DEFAULT 0,
 "netTotalCents" INTEGER NOT NULL, "suggestedMilliMl" INTEGER, "volumeNote" TEXT NOT NULL,
 CHECK ("assignedQuantity" >= 0 AND "assignedQuantity" <= "quantity")
);
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_invoice_lines_invoiceId_lineNumber_key" ON "purchase_invoice_lines"("invoiceId","lineNumber");
CREATE TABLE IF NOT EXISTS "purchase_allocations" (
 "id" TEXT PRIMARY KEY, "lineId" TEXT NOT NULL REFERENCES "purchase_invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestKey" TEXT NOT NULL, "quantity" INTEGER NOT NULL CHECK ("quantity" > 0), "destination" TEXT NOT NULL,
 "targetId" TEXT NOT NULL, "targetName" TEXT NOT NULL, "bottleMilliMl" INTEGER,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_allocations_requestKey_key" ON "purchase_allocations"("requestKey");

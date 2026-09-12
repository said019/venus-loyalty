CREATE TABLE "skin_advisor_assessments" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "input" JSONB NOT NULL,
  "assessment" JSONB,
  "provenance" JSONB,
  "approval" JSONB,
  "failureCode" TEXT,
  "attemptToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "generatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "skin_advisor_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "skin_advisor_assessments_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "client_records"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "skin_advisor_assessments_recordId_createdAt_idx" ON "skin_advisor_assessments"("recordId", "createdAt");
CREATE INDEX "skin_advisor_assessments_status_leaseUntil_idx" ON "skin_advisor_assessments"("status", "leaseUntil");
CREATE UNIQUE INDEX "skin_advisor_one_generation_per_user" ON "skin_advisor_assessments"("generatedById") WHERE "status" = 'generating';

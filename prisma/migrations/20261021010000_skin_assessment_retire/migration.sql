-- AlterTable
ALTER TABLE "skin_advisor_assessments" ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "retiredById" TEXT;

-- CreateIndex
CREATE INDEX "skin_advisor_assessments_recordId_retiredAt_idx" ON "skin_advisor_assessments"("recordId", "retiredAt");


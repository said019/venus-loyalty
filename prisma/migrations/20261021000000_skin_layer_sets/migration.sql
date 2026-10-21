-- CreateTable
CREATE TABLE "skin_layer_sets" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "sourcePhotoId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "notice" TEXT NOT NULL,
    "images" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skin_layer_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skin_layer_sets_sourcePhotoId_createdAt_idx" ON "skin_layer_sets"("sourcePhotoId", "createdAt");

-- CreateIndex
CREATE INDEX "skin_layer_sets_recordId_idx" ON "skin_layer_sets"("recordId");

-- AddForeignKey
ALTER TABLE "skin_layer_sets" ADD CONSTRAINT "skin_layer_sets_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "client_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_layer_sets" ADD CONSTRAINT "skin_layer_sets_sourcePhotoId_fkey" FOREIGN KEY ("sourcePhotoId") REFERENCES "client_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;


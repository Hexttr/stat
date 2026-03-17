-- CreateEnum
CREATE TYPE "FormTemplateVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "FormField"
ADD COLUMN "columnId" TEXT,
ADD COLUMN "columnKey" TEXT,
ADD COLUMN "fieldPath" TEXT,
ADD COLUMN "helpText" TEXT,
ADD COLUMN "placeholder" TEXT,
ADD COLUMN "rowId" TEXT,
ADD COLUMN "rowKey" TEXT,
ADD COLUMN "tableId" TEXT;

-- AlterTable
ALTER TABLE "FormTemplateVersion"
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "publishedById" TEXT,
ADD COLUMN "versionStatus" "FormTemplateVersionStatus" NOT NULL DEFAULT 'DRAFT';

-- Backfill version status from previous column
UPDATE "FormTemplateVersion"
SET "versionStatus" = CASE
  WHEN "status"::text = 'PUBLISHED' THEN 'PUBLISHED'::"FormTemplateVersionStatus"
  WHEN "status"::text = 'ARCHIVED' THEN 'ARCHIVED'::"FormTemplateVersionStatus"
  ELSE 'DRAFT'::"FormTemplateVersionStatus"
END;

-- Drop old version lifecycle column
ALTER TABLE "FormTemplateVersion" DROP COLUMN "status";

-- CreateIndex
CREATE UNIQUE INDEX "FormTemplate_formTypeId_name_key" ON "FormTemplate"("formTypeId", "name");

-- AddForeignKey
ALTER TABLE "FormTemplateVersion"
ADD CONSTRAINT "FormTemplateVersion_publishedById_fkey"
FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

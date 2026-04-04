CREATE TYPE "ArchiveStructureOverrideTargetType" AS ENUM ('TABLE_TITLE', 'ROW_LABEL', 'COLUMN_LABEL');

CREATE TABLE "ArchiveStructureOverride" (
  "id" TEXT NOT NULL,
  "formTypeId" TEXT NOT NULL,
  "reportingYearId" TEXT NOT NULL,
  "targetType" "ArchiveStructureOverrideTargetType" NOT NULL,
  "tableId" TEXT NOT NULL,
  "rowKey" TEXT,
  "columnKey" TEXT,
  "originalLabel" TEXT,
  "overrideLabel" TEXT NOT NULL,
  "note" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ArchiveStructureOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArchiveStructureOverride_formTypeId_reportingYearId_targetTy_key"
ON "ArchiveStructureOverride"("formTypeId", "reportingYearId", "targetType", "tableId", "rowKey", "columnKey");

CREATE INDEX "ArchiveStructureOverride_formTypeId_reportingYearId_targetType_idx"
ON "ArchiveStructureOverride"("formTypeId", "reportingYearId", "targetType");

CREATE INDEX "ArchiveStructureOverride_reportingYearId_tableId_idx"
ON "ArchiveStructureOverride"("reportingYearId", "tableId");

ALTER TABLE "ArchiveStructureOverride"
ADD CONSTRAINT "ArchiveStructureOverride_formTypeId_fkey"
FOREIGN KEY ("formTypeId") REFERENCES "FormType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArchiveStructureOverride"
ADD CONSTRAINT "ArchiveStructureOverride_reportingYearId_fkey"
FOREIGN KEY ("reportingYearId") REFERENCES "ReportingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArchiveStructureOverride"
ADD CONSTRAINT "ArchiveStructureOverride_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArchiveStructureOverride"
ADD CONSTRAINT "ArchiveStructureOverride_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

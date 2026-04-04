CREATE TYPE "DashboardMetricTrend" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NEUTRAL');

CREATE TYPE "DashboardPeriodAggregation" AS ENUM ('SUM');

CREATE TYPE "DashboardFilterControlType" AS ENUM ('SINGLE_SELECT');

ALTER TABLE "MetricDefinition"
ADD COLUMN "formTypeId" TEXT,
ADD COLUMN "sourceFieldKey" TEXT,
ADD COLUMN "unit" TEXT,
ADD COLUMN "isDashboardEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "trendDirection" "DashboardMetricTrend" NOT NULL DEFAULT 'NEUTRAL',
ADD COLUMN "periodAggregation" "DashboardPeriodAggregation" NOT NULL DEFAULT 'SUM',
ADD COLUMN "normalThreshold" DECIMAL(18,4),
ADD COLUMN "goodThreshold" DECIMAL(18,4);

UPDATE "MetricDefinition"
SET "formTypeId" = (
  SELECT ft.id
  FROM "FormType" ft
  ORDER BY ft."createdAt" ASC
  LIMIT 1
)
WHERE "formTypeId" IS NULL;

UPDATE "MetricDefinition"
SET "sourceFieldKey" = "code"
WHERE "sourceFieldKey" IS NULL;

ALTER TABLE "MetricDefinition"
ALTER COLUMN "formTypeId" SET NOT NULL,
ALTER COLUMN "sourceFieldKey" SET NOT NULL;

CREATE TABLE "DashboardFilterDefinition" (
  "id" TEXT NOT NULL,
  "formTypeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "controlType" "DashboardFilterControlType" NOT NULL DEFAULT 'SINGLE_SELECT',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DashboardFilterDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DashboardFilterOption" (
  "id" TEXT NOT NULL,
  "filterDefinitionId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DashboardFilterOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DashboardMetricFilterOption" (
  "id" TEXT NOT NULL,
  "metricId" TEXT NOT NULL,
  "filterOptionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DashboardMetricFilterOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DashboardFilterDefinition_formTypeId_code_key"
ON "DashboardFilterDefinition"("formTypeId", "code");

CREATE INDEX "DashboardFilterDefinition_formTypeId_isActive_sortOrder_idx"
ON "DashboardFilterDefinition"("formTypeId", "isActive", "sortOrder");

CREATE UNIQUE INDEX "DashboardFilterOption_filterDefinitionId_value_key"
ON "DashboardFilterOption"("filterDefinitionId", "value");

CREATE INDEX "DashboardFilterOption_filterDefinitionId_sortOrder_idx"
ON "DashboardFilterOption"("filterDefinitionId", "sortOrder");

CREATE UNIQUE INDEX "DashboardMetricFilterOption_metricId_filterOptionId_key"
ON "DashboardMetricFilterOption"("metricId", "filterOptionId");

CREATE INDEX "DashboardMetricFilterOption_filterOptionId_metricId_idx"
ON "DashboardMetricFilterOption"("filterOptionId", "metricId");

CREATE INDEX "MetricDefinition_formTypeId_isDashboardEnabled_sortOrder_idx"
ON "MetricDefinition"("formTypeId", "isDashboardEnabled", "sortOrder");

CREATE INDEX "MetricDefinition_formTypeId_sourceFieldKey_idx"
ON "MetricDefinition"("formTypeId", "sourceFieldKey");

ALTER TABLE "MetricDefinition"
ADD CONSTRAINT "MetricDefinition_formTypeId_fkey"
FOREIGN KEY ("formTypeId") REFERENCES "FormType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardFilterDefinition"
ADD CONSTRAINT "DashboardFilterDefinition_formTypeId_fkey"
FOREIGN KEY ("formTypeId") REFERENCES "FormType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardFilterOption"
ADD CONSTRAINT "DashboardFilterOption_filterDefinitionId_fkey"
FOREIGN KEY ("filterDefinitionId") REFERENCES "DashboardFilterDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardMetricFilterOption"
ADD CONSTRAINT "DashboardMetricFilterOption_metricId_fkey"
FOREIGN KEY ("metricId") REFERENCES "MetricDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardMetricFilterOption"
ADD CONSTRAINT "DashboardMetricFilterOption_filterOptionId_fkey"
FOREIGN KEY ("filterOptionId") REFERENCES "DashboardFilterOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { CANONICAL_DOCX_BATCH_NAME } from "./docx";
import { HANDOFF_BATCH_NAME } from "./service";

export const ARCHIVE_DASHBOARD_CACHE_TAG = "archive-dashboard";

type DocxImportMetricsRow = {
  year: number;
  formCode: string;
  subjectDocs: number;
  scopeDocs: number;
  unmatchedSubjectDocs: number;
  extractedDocs: number;
  distinctRegions: number;
  duplicateSubjectFiles: number;
  nullRegionFiles: number;
  stagedValues: number;
  structureSignatures: number;
};

type DocxOverallImportMetricsRow = {
  importedDocs: number;
  importedSubjectFiles: number;
  scopeFiles: number;
  unmatchedSubjectFiles: number;
  extractedFiles: number;
  extractedValues: number;
  structureSignatures: number;
};

type VersionCountRow = {
  year: number;
  formCode: string;
  versionCount: number;
};

type ImportMetricsRow = {
  year: number;
  formCode: string;
  importedDocs: number;
  extractedDocs: number;
  distinctRegions: number;
  duplicateSubjectFiles: number;
  nullRegionFiles: number;
  stagedValues: number;
};

type OverallImportMetricsRow = {
  importedDocs: number;
  importedSubjectFiles: number;
  extractedFiles: number;
  extractedValues: number;
};

type SubmissionCoverageRow = {
  year: number;
  formCode: string;
  regionSubmissions: number;
  mappedSubmissions: number;
  mappedValues: number;
};

type DocxQaBacklogRow = {
  qaBacklog: number;
};

type ArchiveDashboardSnapshot = {
  docxImportMetricsRows: DocxImportMetricsRow[];
  docxOverallImportMetrics: DocxOverallImportMetricsRow[];
  versionCountRows: VersionCountRow[];
  importMetricsRows: ImportMetricsRow[];
  overallImportMetrics: OverallImportMetricsRow[];
  submissionCoverageRows: SubmissionCoverageRow[];
  docxQaBacklogRows: DocxQaBacklogRow[];
};

function toNumber(value: string | number | bigint | null | undefined) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return 0;
}

async function loadArchiveDashboardSnapshotUncached(): Promise<ArchiveDashboardSnapshot> {
  const [
    docxImportMetricsRowsRaw,
    docxOverallImportMetricsRaw,
    versionCountRowsRaw,
    importMetricsRowsRaw,
    overallImportMetricsRaw,
    submissionCoverageRowsRaw,
    docxQaBacklogRowsRaw,
  ] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        year: number;
        formCode: string;
        subjectDocs: number;
        scopeDocs: number;
        unmatchedSubjectDocs: number;
        extractedDocs: number;
        distinctRegions: number;
        duplicateSubjectFiles: number;
        nullRegionFiles: number;
        stagedValues: string;
        structureSignatures: number;
      }>
    >`
      select
        ry.year as year,
        ft.code as "formCode",
        count(*) filter (
          where coalesce(f."detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
        )::int as "subjectDocs",
        count(*) filter (
          where coalesce(f."detectedMetadata"->'docxRegistry'->>'resolvedKind', '') = 'SCOPE'
        )::int as "scopeDocs",
        count(*) filter (
          where coalesce(f."detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
            and f."regionId" is null
        )::int as "unmatchedSubjectDocs",
        count(*) filter (
          where f.status = 'EXTRACTED'
            and coalesce(f."detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
        )::int as "extractedDocs",
        count(distinct f."regionId") filter (
          where f.status = 'EXTRACTED'
            and coalesce(f."detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
            and f."regionId" is not null
        )::int as "distinctRegions",
        (
          count(*) filter (
            where f.status = 'EXTRACTED'
              and coalesce(f."detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
              and f."regionId" is not null
          )
          - count(distinct f."regionId") filter (
            where f.status = 'EXTRACTED'
              and coalesce(f."detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
              and f."regionId" is not null
          )
        )::int as "duplicateSubjectFiles",
        count(*) filter (
          where f.status = 'EXTRACTED'
            and coalesce(f."detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
            and f."regionId" is null
        )::int as "nullRegionFiles",
        coalesce(
          sum(
            case
              when f.status = 'EXTRACTED'
                and coalesce(f."detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
              then coalesce((f."extractedPayload"->>'totalValues')::bigint, 0)
              else 0
            end
          ),
          0
        )::text as "stagedValues",
        count(distinct nullif(f."extractedPayload"->>'structureSignature', ''))::int as "structureSignatures"
      from "ImportFile" f
      join "ReportingYear" ry on ry.id = f."reportingYearId"
      join "FormType" ft on ft.id = f."formTypeId"
      where f."batchId" = ${CANONICAL_DOCX_BATCH_NAME}
      group by ry.year, ft.code
    `,
    prisma.$queryRaw<
      Array<{
        importedDocs: number;
        importedSubjectFiles: number;
        scopeFiles: number;
        unmatchedSubjectFiles: number;
        extractedFiles: number;
        extractedValues: string;
        structureSignatures: number;
      }>
    >`
      select
        count(*)::int as "importedDocs",
        count(*) filter (
          where coalesce("detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
            and "regionId" is not null
        )::int as "importedSubjectFiles",
        count(*) filter (
          where coalesce("detectedMetadata"->'docxRegistry'->>'resolvedKind', '') = 'SCOPE'
        )::int as "scopeFiles",
        count(*) filter (
          where coalesce("detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
            and "regionId" is null
        )::int as "unmatchedSubjectFiles",
        count(*) filter (
          where status = 'EXTRACTED'
            and coalesce("detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
        )::int as "extractedFiles",
        coalesce(
          sum(
            case
              when status = 'EXTRACTED'
                and coalesce("detectedMetadata"->'docxRegistry'->>'resolvedKind', 'SUBJECT') = 'SUBJECT'
              then coalesce(("extractedPayload"->>'totalValues')::bigint, 0)
              else 0
            end
          ),
          0
        )::text as "extractedValues",
        count(distinct nullif("extractedPayload"->>'structureSignature', ''))::int as "structureSignatures"
      from "ImportFile"
      where "batchId" = ${CANONICAL_DOCX_BATCH_NAME}
    `,
    prisma.$queryRaw<
      Array<{
        year: number;
        formCode: string;
        versionCount: number;
      }>
    >`
      select
        ry.year as year,
        ft.code as "formCode",
        count(*)::int as "versionCount"
      from "FormTemplateVersion" v
      join "ReportingYear" ry on ry.id = v."reportingYearId"
      join "FormTemplate" t on t.id = v."templateId"
      join "FormType" ft on ft.id = t."formTypeId"
      where ry.year between 2019 and 2024
      group by ry.year, ft.code
    `,
    prisma.$queryRaw<
      Array<{
        year: number;
        formCode: string;
        importedDocs: number;
        extractedDocs: number;
        distinctRegions: number;
        duplicateSubjectFiles: number;
        nullRegionFiles: number;
        stagedValues: string;
      }>
    >`
      select
        ry.year as year,
        ft.code as "formCode",
        count(*)::int as "importedDocs",
        count(*) filter (where f.status = 'EXTRACTED')::int as "extractedDocs",
        count(distinct f."regionId") filter (
          where f.status = 'EXTRACTED' and f."regionId" is not null
        )::int as "distinctRegions",
        (
          count(*) filter (where f.status = 'EXTRACTED' and f."regionId" is not null)
          - count(distinct f."regionId") filter (
            where f.status = 'EXTRACTED' and f."regionId" is not null
          )
        )::int as "duplicateSubjectFiles",
        count(*) filter (
          where f.status = 'EXTRACTED' and f."regionId" is null
        )::int as "nullRegionFiles",
        coalesce(
          sum(
            case
              when f.status = 'EXTRACTED'
              then coalesce((f."extractedPayload"->>'totalValues')::bigint, 0)
              else 0
            end
          ),
          0
        )::text as "stagedValues"
      from "ImportFile" f
      join "ReportingYear" ry on ry.id = f."reportingYearId"
      join "FormType" ft on ft.id = f."formTypeId"
      where f."batchId" = ${HANDOFF_BATCH_NAME}
      group by ry.year, ft.code
    `,
    prisma.$queryRaw<
      Array<{
        importedDocs: number;
        importedSubjectFiles: number;
        extractedFiles: number;
        extractedValues: string;
      }>
    >`
      select
        count(*)::int as "importedDocs",
        count(*) filter (where "regionId" is not null)::int as "importedSubjectFiles",
        count(*) filter (where status = 'EXTRACTED')::int as "extractedFiles",
        coalesce(
          sum(
            case
              when status = 'EXTRACTED'
              then coalesce(("extractedPayload"->>'totalValues')::bigint, 0)
              else 0
            end
          ),
          0
        )::text as "extractedValues"
      from "ImportFile"
      where "batchId" = ${HANDOFF_BATCH_NAME}
    `,
    prisma.$queryRaw<
      Array<{
        year: number;
        formCode: string;
        regionSubmissions: number;
        mappedSubmissions: number;
        mappedValues: string;
      }>
    >`
      with submission_counts as (
        select
          ry.year as year,
          ft.code as "formCode",
          count(distinct s.id)::int as "regionSubmissions"
        from "Submission" s
        join "Organization" org on org.id = s."organizationId"
        join "FormAssignment" a on a.id = s."assignmentId"
        join "FormTemplateVersion" v on v.id = a."templateVersionId"
        join "FormTemplate" t on t.id = v."templateId"
        join "FormType" ft on ft.id = t."formTypeId"
        join "ReportingYear" ry on ry.id = a."reportingYearId"
        where org.type = 'REGION_CENTER'
          and ry.year between 2019 and 2024
        group by ry.year, ft.code
      ),
      mapped_submission_counts as (
        select
          ry.year as year,
          ft.code as "formCode",
          count(distinct sv."submissionId")::int as "mappedSubmissions",
          count(*)::text as "mappedValues"
        from "SubmissionValue" sv
        join "Submission" s on s.id = sv."submissionId"
        join "Organization" org on org.id = s."organizationId"
        join "FormAssignment" a on a.id = s."assignmentId"
        join "FormTemplateVersion" v on v.id = a."templateVersionId"
        join "FormTemplate" t on t.id = v."templateId"
        join "FormType" ft on ft.id = t."formTypeId"
        join "ReportingYear" ry on ry.id = a."reportingYearId"
        where org.type = 'REGION_CENTER'
          and ry.year between 2019 and 2024
        group by ry.year, ft.code
      )
      select
        s.year,
        s."formCode",
        s."regionSubmissions",
        coalesce(m."mappedSubmissions", 0)::int as "mappedSubmissions",
        coalesce(m."mappedValues", '0') as "mappedValues"
      from submission_counts s
      left join mapped_submission_counts m on m.year = s.year and m."formCode" = s."formCode"
      order by s.year, s."formCode"
    `,
    prisma.$queryRaw<Array<{ qaBacklog: number }>>`
      select count(*)::int as "qaBacklog"
      from "ArchiveQaIssue" q
      join "ImportFile" f on f.id = q."importFileId"
      where f."batchId" = ${CANONICAL_DOCX_BATCH_NAME}
        and q.status not in ('FIXED', 'VERIFIED')
    `,
  ]);

  return {
    docxImportMetricsRows: docxImportMetricsRowsRaw.map((row) => ({
      ...row,
      stagedValues: toNumber(row.stagedValues),
    })),
    docxOverallImportMetrics: docxOverallImportMetricsRaw.map((row) => ({
      ...row,
      extractedValues: toNumber(row.extractedValues),
    })),
    versionCountRows: versionCountRowsRaw,
    importMetricsRows: importMetricsRowsRaw.map((row) => ({
      ...row,
      stagedValues: toNumber(row.stagedValues),
    })),
    overallImportMetrics: overallImportMetricsRaw.map((row) => ({
      ...row,
      extractedValues: toNumber(row.extractedValues),
    })),
    submissionCoverageRows: submissionCoverageRowsRaw.map((row) => ({
      ...row,
      mappedValues: toNumber(row.mappedValues),
    })),
    docxQaBacklogRows: docxQaBacklogRowsRaw,
  };
}

export const getArchiveDashboardSnapshot = unstable_cache(loadArchiveDashboardSnapshotUncached, ["archive-dashboard-snapshot"], {
  tags: [ARCHIVE_DASHBOARD_CACHE_TAG],
  revalidate: 3600,
});

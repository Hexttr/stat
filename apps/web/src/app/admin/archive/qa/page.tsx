import Link from "next/link";

import {
  createArchiveQaIssueAction,
  resetArchiveStructureOverrideAction,
  saveArchiveStructureOverridesAction,
} from "@/app/admin/actions";
import { ArchiveStructureEditor } from "@/app/admin/archive/qa/archive-structure-editor";
import {
  ArchiveStructureOverrideTargetType,
  ImportFileStatus,
  OrganizationType,
  Prisma,
} from "@/generated/prisma/client";
import { parseAndNormalizeFormSchema } from "@/lib/form-builder/schema";
import { requireSuperadmin } from "@/lib/access";
import { HANDOFF_BATCH_NAME } from "@/lib/archive/service";
import { prisma } from "@/lib/prisma";

const targetYears = [2019, 2020, 2021, 2022, 2023, 2024];
const fileListPageSize = 40;

function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPreviewValue(value: {
  valueText?: string | null;
  valueNumber?: { toString(): string } | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
}) {
  if (value.valueNumber !== null && value.valueNumber !== undefined) {
    return value.valueNumber.toString();
  }
  if (value.valueText !== null && value.valueText !== undefined && value.valueText !== "") {
    return value.valueText;
  }
  if (value.valueBoolean !== null && value.valueBoolean !== undefined) {
    return value.valueBoolean ? "Да" : "Нет";
  }
  if (value.valueJson !== null && value.valueJson !== undefined) {
    return JSON.stringify(value.valueJson);
  }
  return "Пусто";
}

function buildQaHref(params: {
  year?: string | number | null;
  formCode?: string | null;
  regionId?: string | null;
  importFileId?: string | null;
  page?: string | number | null;
  problemOnly?: boolean;
  loadValues?: boolean;
}) {
  const search = new URLSearchParams();
  if (params.year) {
    search.set("year", String(params.year));
  }
  if (params.formCode) {
    search.set("formCode", params.formCode);
  }
  if (params.regionId) {
    search.set("regionId", params.regionId);
  }
  if (params.importFileId) {
    search.set("importFileId", params.importFileId);
  }
  if (params.page && Number(params.page) > 1) {
    search.set("page", String(params.page));
  }
  if (params.problemOnly) {
    search.set("problemOnly", "1");
  }
  if (params.loadValues) {
    search.set("loadValues", "1");
  }

  const query = search.toString();
  return query ? `/admin/archive/qa?${query}` : "/admin/archive/qa";
}

function extractUnmatchedCount(reviewComment: string | null | undefined) {
  const match = (reviewComment ?? "").match(/,\s*(\d+)\s+значений требуют ручной проверки/u);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNotice(value: string | string[] | undefined, expectedLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const decoded = decodeURIComponent(value).split("|");
  return decoded.length >= expectedLength ? decoded : null;
}

function HelpHint({ text, label }: { text: string; label: string }) {
  return (
    <details className="group relative shrink-0">
      <summary
        aria-label={label}
        className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
      >
        ?
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-64 rounded-2xl bg-white p-3 text-xs leading-5 text-slate-700 shadow-2xl ring-1 ring-slate-200">
        {text}
      </div>
    </details>
  );
}

export default async function AdminArchiveQaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperadmin();

  const params = (await searchParams) ?? {};
  const issueCreated = parseNotice(params.issueCreated, 2);
  const structureSaved = parseNotice(params.structureSaved, 3);
  const error = getParam(params, "error");
  const requestedYear = Number(getParam(params, "year") ?? 2024);
  const requestedPage = Number(getParam(params, "page") ?? 1);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const problemOnly = getParam(params, "problemOnly") === "1";
  const loadValues = getParam(params, "loadValues") === "1";

  const formTypes = await prisma.formType.findMany({
    where: {
      importFiles: {
        some: {
          batchId: HANDOFF_BATCH_NAME,
          status: ImportFileStatus.EXTRACTED,
          regionId: {
            not: null,
          },
        },
      },
    },
    orderBy: {
      code: "asc",
    },
  });

  const effectiveYear = targetYears.includes(requestedYear) ? requestedYear : 2024;
  const requestedFormCode = getParam(params, "formCode");
  const effectiveFormCode =
    requestedFormCode && formTypes.some((formType) => formType.code === requestedFormCode)
      ? requestedFormCode
      : (formTypes[0]?.code ?? null);

  const regionCandidates = await prisma.importFile.findMany({
    where: {
      batchId: HANDOFF_BATCH_NAME,
      status: ImportFileStatus.EXTRACTED,
      reportingYear: {
        year: effectiveYear,
      },
      regionId: {
        not: null,
      },
      ...(effectiveFormCode
        ? {
            formType: {
              code: effectiveFormCode,
            },
          }
        : {}),
    },
    distinct: ["regionId"],
    select: {
      region: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  const regions = regionCandidates
    .map((item) => item.region)
    .filter((region): region is NonNullable<typeof region> => Boolean(region))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));

  const requestedRegionId = getParam(params, "regionId");
  const effectiveRegionId =
    requestedRegionId && regions.some((region) => region.id === requestedRegionId)
      ? requestedRegionId
      : null;

  const candidateFileFilters = [
    Prisma.sql`f."batchId" = ${HANDOFF_BATCH_NAME}`,
    Prisma.sql`f.status = 'EXTRACTED'`,
    Prisma.sql`f."regionId" is not null`,
    Prisma.sql`ry.year = ${effectiveYear}`,
    ...(effectiveFormCode ? [Prisma.sql`ft.code = ${effectiveFormCode}`] : []),
    ...(effectiveRegionId ? [Prisma.sql`f."regionId" = ${effectiveRegionId}`] : []),
    ...(problemOnly
      ? [
          Prisma.sql`(
            exists(select 1 from "ImportIssue" ii where ii."importFileId" = f.id)
            or exists(select 1 from "ArchiveQaIssue" qa where qa."importFileId" = f.id)
            or coalesce((f."extractedPayload"->>'missingSemantics')::int, 0) > 0
          )`,
        ]
      : []),
  ];
  const candidateFilesWhereSql = Prisma.sql`where ${Prisma.join(
    candidateFileFilters,
    " and ",
  )}`;
  const candidateFileCountRows = await prisma.$queryRaw<Array<{ count: number }>>`
    select count(*)::int as count
    from "ImportFile" f
    join "ReportingYear" ry on ry.id = f."reportingYearId"
    join "FormType" ft on ft.id = f."formTypeId"
    ${candidateFilesWhereSql}
  `;
  const totalCandidateFiles = candidateFileCountRows[0]?.count ?? 0;
  const totalPages = Math.max(Math.ceil(totalCandidateFiles / fileListPageSize), 1);
  const safePage = Math.min(currentPage, totalPages);
  const candidateFilesBase = await prisma.$queryRaw<
    Array<{
      id: string;
      originalName: string;
      storagePath: string;
      regionId: string | null;
      regionFullName: string | null;
      formCode: string | null;
      year: number | null;
      missingSemantics: number;
    }>
  >`
    select
      f.id,
      f."originalName",
      f."storagePath",
      f."regionId",
      r."fullName" as "regionFullName",
      ft.code as "formCode",
      ry.year as year,
      coalesce((f."extractedPayload"->>'missingSemantics')::int, 0) as "missingSemantics"
    from "ImportFile" f
    join "ReportingYear" ry on ry.id = f."reportingYearId"
    join "FormType" ft on ft.id = f."formTypeId"
    left join "Region" r on r.id = f."regionId"
    ${candidateFilesWhereSql}
    order by r."fullName" asc nulls last, f."storagePath" asc
    limit ${fileListPageSize}
    offset ${(safePage - 1) * fileListPageSize}
  `;
  const candidateFileIds = candidateFilesBase.map((file) => file.id);
  const [fieldValueCountRows, issueCountRows, qaIssueCountRows] =
    candidateFileIds.length > 0
      ? await Promise.all([
          prisma.$queryRaw<Array<{ importFileId: string; count: number }>>`
            select "importFileId", count(*)::int as count
            from "ImportFieldValue"
            where "importFileId" in (${Prisma.join(candidateFileIds)})
            group by "importFileId"
          `,
          prisma.$queryRaw<Array<{ importFileId: string; count: number }>>`
            select "importFileId", count(*)::int as count
            from "ImportIssue"
            where "importFileId" in (${Prisma.join(candidateFileIds)})
            group by "importFileId"
          `,
          prisma.$queryRaw<Array<{ importFileId: string; count: number }>>`
            select "importFileId", count(*)::int as count
            from "ArchiveQaIssue"
            where "importFileId" in (${Prisma.join(candidateFileIds)})
            group by "importFileId"
          `,
        ])
      : [[], [], []];
  const fieldValueCountByFileId = new Map(
    fieldValueCountRows.map((row) => [row.importFileId, row.count]),
  );
  const issueCountByFileId = new Map(issueCountRows.map((row) => [row.importFileId, row.count]));
  const qaIssueCountByFileId = new Map(
    qaIssueCountRows.map((row) => [row.importFileId, row.count]),
  );
  const candidateFiles = candidateFilesBase.map((file) => ({
    ...file,
    fieldValueCount: fieldValueCountByFileId.get(file.id) ?? 0,
    issueCount: issueCountByFileId.get(file.id) ?? 0,
    qaIssueCount: qaIssueCountByFileId.get(file.id) ?? 0,
  }));

  const requestedImportFileId = getParam(params, "importFileId");
  const effectiveImportFileId =
    requestedImportFileId && candidateFiles.some((file) => file.id === requestedImportFileId)
      ? requestedImportFileId
      : (candidateFiles[0]?.id ?? null);

  const selectedFile = effectiveImportFileId
    ? await prisma.importFile.findUnique({
        where: {
          id: effectiveImportFileId,
        },
        include: {
          region: true,
          formType: true,
          reportingYear: true,
          issues: {
            orderBy: {
              createdAt: "desc",
            },
            take: 12,
          },
          _count: {
            select: {
              fieldValues: true,
              issues: true,
            },
          },
        },
      })
    : null;
  const selectedArchiveQaIssues = selectedFile
    ? await prisma.$queryRaw<
        Array<{
          id: string;
          type: string;
          scale: string;
          status: string;
          title: string;
          description: string;
          rawEvidence: string | null;
          expectedResult: string | null;
          actualResult: string | null;
          createdAt: Date;
          createdByFullName: string | null;
        }>
      >`
        select
          issue.id,
          issue.type::text as type,
          issue.scale::text as scale,
          issue.status::text as status,
          issue.title,
          issue.description,
          issue."rawEvidence",
          issue."expectedResult",
          issue."actualResult",
          issue."createdAt",
          author."fullName" as "createdByFullName"
        from "ArchiveQaIssue" issue
        left join "User" author on author.id = issue."createdById"
        where issue."importFileId" = ${selectedFile.id}
        order by issue."createdAt" desc
        limit 20
      `
    : [];
  const structureOverrides =
    selectedFile?.formTypeId && selectedFile.reportingYearId
      ? await prisma.archiveStructureOverride.findMany({
          where: {
            formTypeId: selectedFile.formTypeId,
            reportingYearId: selectedFile.reportingYearId,
          },
          orderBy: [
            { tableId: "asc" },
            { targetType: "asc" },
            { rowKey: "asc" },
            { columnKey: "asc" },
          ],
        })
      : [];
  const selectedSubmission =
    selectedFile?.regionId && selectedFile.reportingYearId && selectedFile.formTypeId
      ? await prisma.submission.findFirst({
          where: {
            organization: {
              type: OrganizationType.REGION_CENTER,
            },
            assignment: {
              regionId: selectedFile.regionId,
              reportingYearId: selectedFile.reportingYearId,
              templateVersion: {
                template: {
                  formTypeId: selectedFile.formTypeId,
                },
              },
            },
          },
          include: {
            assignment: {
              include: {
                region: true,
                reportingYear: true,
                templateVersion: {
                  include: {
                    template: {
                      include: {
                        formType: true,
                      },
                    },
                  },
                },
              },
            },
            _count: {
              select: {
                values: true,
              },
            },
          },
        })
      : null;
  const structureOverrideByTarget = new Map(
    structureOverrides.map((override) => [
      `${override.targetType}|${override.tableId}|${override.rowKey ?? ""}|${override.columnKey ?? ""}`,
      override,
    ]),
  );
  const selectedSchema =
    selectedSubmission?.assignment.templateVersion.schemaJson ?? null;
  const selectedStructureTables = selectedSchema
    ? parseAndNormalizeFormSchema(selectedSchema).tables
    : [];
  const structureDraftEntries =
    selectedFile?.formTypeId && selectedFile.reportingYearId
      ? selectedStructureTables.flatMap((table) => {
          const entries: Array<{
            targetType: ArchiveStructureOverrideTargetType;
            tableId: string;
            rowKey: string | null;
            columnKey: string | null;
            originalLabel: string;
            currentLabel: string;
            overrideId: string | null;
            note: string | null;
          }> = [];

          const tableOverride = structureOverrideByTarget.get(
            `${ArchiveStructureOverrideTargetType.TABLE_TITLE}|${table.id}||`,
          );
          entries.push({
            targetType: ArchiveStructureOverrideTargetType.TABLE_TITLE,
            tableId: table.id,
            rowKey: null,
            columnKey: null,
            originalLabel: table.title,
            currentLabel: tableOverride?.overrideLabel ?? table.title,
            overrideId: tableOverride?.id ?? null,
            note: tableOverride?.note ?? null,
          });

          for (const row of table.rows) {
            const rowOverride = structureOverrideByTarget.get(
              `${ArchiveStructureOverrideTargetType.ROW_LABEL}|${table.id}|${row.key}|`,
            );
            entries.push({
              targetType: ArchiveStructureOverrideTargetType.ROW_LABEL,
              tableId: table.id,
              rowKey: row.key,
              columnKey: null,
              originalLabel: row.label,
              currentLabel: rowOverride?.overrideLabel ?? row.label,
              overrideId: rowOverride?.id ?? null,
              note: rowOverride?.note ?? null,
            });
          }

          for (const column of table.columns) {
            const columnOverride = structureOverrideByTarget.get(
              `${ArchiveStructureOverrideTargetType.COLUMN_LABEL}|${table.id}||${column.key}`,
            );
            entries.push({
              targetType: ArchiveStructureOverrideTargetType.COLUMN_LABEL,
              tableId: table.id,
              rowKey: null,
              columnKey: column.key,
              originalLabel: column.label,
              currentLabel: columnOverride?.overrideLabel ?? column.label,
              overrideId: columnOverride?.id ?? null,
              note: columnOverride?.note ?? null,
            });
          }

          return entries;
        })
      : [];
  const selectedRawFieldValues =
    loadValues && selectedFile
      ? await prisma.importFieldValue.findMany({
          where: {
            importFileId: selectedFile.id,
          },
          orderBy: {
            createdAt: "asc",
          },
          take: 40,
        })
      : [];
  const selectedSubmissionValues =
    loadValues && selectedSubmission
      ? await prisma.submissionValue.findMany({
          where: {
            submissionId: selectedSubmission.id,
          },
          include: {
            field: true,
          },
          orderBy: {
            field: {
              sortOrder: "asc",
            },
          },
          take: 40,
        })
      : [];

  const [selectedRawValueCount, selectedNumericRawCount] = selectedFile
    ? await Promise.all([
        prisma.importFieldValue.count({
          where: {
            importFileId: selectedFile.id,
          },
        }),
        prisma.importFieldValue.count({
          where: {
            importFileId: selectedFile.id,
            valueNumber: {
              not: null,
            },
          },
        }),
      ])
    : [0, 0];

  const unmatchedCount = extractUnmatchedCount(selectedSubmission?.reviewComment);
  const selectedExtractedPayload =
    (selectedFile?.extractedPayload as
      | {
          totalValues?: number;
          importedAt?: string;
          missingSemantics?: number;
        }
      | null) ?? null;
  const stepGuide = [
    {
      title: "1. Выберите срез",
      text: "Задайте год, форму и при необходимости регион, затем нажмите «Применить».",
    },
    {
      title: "2. Откройте файл",
      text: "Слева выберите конкретный архивный документ и проверьте его summary.",
    },
    {
      title: "3. Сравните слои",
      text: "Смотрите разницу между сырыми ImportFieldValue и финальными SubmissionValue.",
    },
    {
      title: "4. Отметьте проблему",
      text: "Если есть расхождение, фиксируйте тип: staging, mapping, schema или единичное значение.",
    },
  ];
  const qaMetricCards = [
    {
      label: "Сырых значений",
      value: selectedRawValueCount,
      help: "Сколько ячеек извлечено в staging из этого файла до любого сопоставления.",
    },
    {
      label: "Числовых raw значений",
      value: selectedNumericRawCount,
      help: "Сколько сырых значений уже распознано как числа и может идти в числовые поля.",
    },
    {
      label: "Значений в Submission",
      value: selectedSubmission?._count.values ?? 0,
      help: "Сколько значений реально приземлилось в рабочую форму региона.",
    },
    {
      label: "Требуют ручной проверки",
      value: unmatchedCount ?? 0,
      help: "Сколько значений не было уверенно сопоставлено автоматически и требует проверки специалистом.",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Archive QA
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
              Проверка архивного импорта
            </h1>
            <p className="mt-3 max-w-4xl text-slate-600">
              Экран показывает конкретный архивный файл по региону, его сырой staging-слой,
              связанную региональную отправку и примеры значений после маппинга.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/archive"
              className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Назад к архиву
            </Link>
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
        {issueCreated ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Замечание сохранено: тип {issueCreated[0]}, масштаб {issueCreated[1]}.
          </p>
        ) : null}
        {structureSaved ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Правки структуры сохранены: {structureSaved[0]} / {structureSaved[1]}, элементов:{" "}
            {structureSaved[2]}.
          </p>
        ) : null}

        <form
          action="/admin/archive/qa"
          className="mt-8 grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 xl:grid-cols-[180px_180px_minmax(0,1fr)_220px_auto]"
        >
          <div className="space-y-2">
            <label htmlFor="qa-year" className="text-sm font-medium text-slate-700">
              Год
            </label>
            <select
              id="qa-year"
              name="year"
              defaultValue={String(effectiveYear)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
            >
              {targetYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="qa-form" className="text-sm font-medium text-slate-700">
              Форма
            </label>
            <select
              id="qa-form"
              name="formCode"
              defaultValue={effectiveFormCode ?? ""}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
            >
              {formTypes.map((formType) => (
                <option key={formType.id} value={formType.code}>
                  {formType.code}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="qa-region" className="text-sm font-medium text-slate-700">
              Регион
            </label>
            <select
              id="qa-region"
              name="regionId"
              defaultValue={effectiveRegionId ?? ""}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
            >
              <option value="">Все регионы</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.fullName}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="problemOnly"
              value="1"
              defaultChecked={problemOnly}
              className="h-4 w-4 rounded border-slate-300 text-[#1f67ab] focus:ring-[#1f67ab]"
            />
            Только проблемные файлы
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-2xl bg-[#1f67ab] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#185993]"
            >
              Применить
            </button>
          </div>
        </form>

        <div className="mt-5 grid gap-3 xl:grid-cols-4">
          {stepGuide.map((step) => (
            <article
              key={step.title}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <p className="text-sm font-semibold text-slate-900">{step.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold text-slate-950">Файлы выборки</h2>
                <HelpHint
                  label="Пояснение к списку файлов"
                  text="Слева собран список архивных документов по текущему фильтру. Выберите файл, чтобы справа увидеть staging, маппинг и итоговые значения."
                />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Страница {formatCount(safePage)} из {formatCount(totalPages)}. Всего файлов:{" "}
                {formatCount(totalCandidateFiles)}.
              </p>
            </div>
            <span className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {formatCount(candidateFiles.length)}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={buildQaHref({
                year: effectiveYear,
                formCode: effectiveFormCode,
                regionId: effectiveRegionId,
                page: Math.max(safePage - 1, 1),
                problemOnly,
                loadValues,
              })}
              className={`inline-flex items-center rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
                safePage > 1
                  ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  : "pointer-events-none border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              Назад
            </Link>
            <Link
              href={buildQaHref({
                year: effectiveYear,
                formCode: effectiveFormCode,
                regionId: effectiveRegionId,
                page: Math.min(safePage + 1, totalPages),
                problemOnly,
                loadValues,
              })}
              className={`inline-flex items-center rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
                safePage < totalPages
                  ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  : "pointer-events-none border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              Дальше
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            {candidateFiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                По выбранным фильтрам архивных файлов не найдено.
              </div>
            ) : (
              candidateFiles.map((file) => {
                const isActive = file.id === effectiveImportFileId;
                return (
                  <Link
                    key={file.id}
                    href={buildQaHref({
                      year: effectiveYear,
                      formCode: effectiveFormCode,
                      regionId: effectiveRegionId,
                      importFileId: file.id,
                      page: safePage,
                      problemOnly,
                      loadValues,
                    })}
                    className={`block rounded-2xl border px-4 py-4 transition ${
                      isActive
                        ? "border-[#2e78be] bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-950">
                      {file.regionFullName ?? "Регион не определен"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {file.formCode ?? "Без формы"} / {file.year ?? "Без года"}
                    </p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                      {file.originalName}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        raw: {formatCount(file.fieldValueCount)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        issues: {formatCount(file.issueCount)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        qa: {formatCount(file.qaIssueCount)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        sem: {formatCount(file.missingSemantics)}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        <div className="space-y-6">
          {!selectedFile ? (
            <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600 shadow-sm">
              Выбери архивный файл слева, чтобы увидеть staging, маппинг и итоговые значения.
            </section>
          ) : (
            <>
              <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {selectedFile.formType?.code ?? "Архивный файл"} /{" "}
                      {selectedFile.reportingYear?.year ?? "Без года"}
                    </p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                      {selectedFile.region?.fullName ?? "Регион не определен"}
                    </h2>
                    <p className="mt-3 break-all text-sm leading-6 text-slate-600">
                      {selectedFile.storagePath}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    extracted: {formatDate(selectedExtractedPayload?.importedAt)}
                  </div>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {qaMetricCards.map((metric) => (
                    <article
                      key={metric.label}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-slate-500">{metric.label}</p>
                        <HelpHint
                          label={`Пояснение к метрике ${metric.label}`}
                          text={metric.help}
                        />
                      </div>
                      <p className="mt-3 text-2xl font-semibold text-slate-950">
                        {formatCount(metric.value)}
                      </p>
                    </article>
                  ))}
                </div>

                <div className="mt-8 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">Файл и staging</p>
                      <HelpHint
                        label="Пояснение к блоку Файл и staging"
                        text="Технический паспорт исходного файла: статус извлечения, проблемы staging и missing semantics до маппинга в форму."
                      />
                    </div>
                    <dl className="mt-4 space-y-3 text-sm text-slate-600">
                      <div className="flex justify-between gap-4">
                        <dt>Статус</dt>
                        <dd className="font-medium text-slate-900">{selectedFile.status}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt>Файл</dt>
                        <dd className="font-medium text-slate-900">{selectedFile.originalName}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt>Проблем ImportIssue</dt>
                        <dd className="font-medium text-slate-900">
                          {formatCount(selectedFile._count.issues)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt>Missing semantics</dt>
                        <dd className="font-medium text-slate-900">
                          {formatCount(selectedExtractedPayload?.missingSemantics ?? 0)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">Связанный Submission</p>
                      <HelpHint
                        label="Пояснение к блоку Связанный Submission"
                        text="Показывает, найден ли рабочий региональный черновик, в который были перенесены архивные значения."
                      />
                    </div>
                    {selectedSubmission ? (
                      <>
                        <dl className="mt-4 space-y-3 text-sm text-slate-600">
                          <div className="flex justify-between gap-4">
                            <dt>Статус</dt>
                            <dd className="font-medium text-slate-900">
                              {selectedSubmission.status}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt>Отправка</dt>
                            <dd className="font-medium text-slate-900">{selectedSubmission.id}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt>Создана</dt>
                            <dd className="font-medium text-slate-900">
                              {formatDate(selectedSubmission.createdAt)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt>SubmissionValue</dt>
                            <dd className="font-medium text-slate-900">
                              {formatCount(selectedSubmission._count.values)}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Link
                            href={`/admin/forms/review/${selectedSubmission.id}`}
                            className="inline-flex items-center rounded-2xl bg-[#1f67ab] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#185993]"
                          >
                            Открыть заполненную форму
                          </Link>
                          <Link
                            href="#qa-issues"
                            className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            Смотреть замечания QA
                          </Link>
                        </div>
                      </>
                    ) : (
                      <p className="mt-4 text-sm text-slate-600">
                        Для этого файла пока не найден региональный `Submission`.
                      </p>
                    )}
                  </div>
                </div>

                {selectedSubmission?.reviewComment ? (
                  <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-amber-900">Комментарий маппинга</p>
                      <HelpHint
                        label="Пояснение к комментарию маппинга"
                        text="Краткий итог автоматического маппинга: сколько значений сопоставлено и сколько осталось на ручную проверку."
                      />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900">
                      {selectedSubmission.reviewComment}
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-semibold text-slate-950">
                      Зафиксировать замечание
                    </h3>
                    <HelpHint
                      label="Пояснение к фиксации замечаний"
                      text="Сохраняйте здесь конкретные найденные расхождения. Эти записи нужны, чтобы потом чинить extraction, mapping или точечные исторические значения."
                    />
                  </div>
                  <span className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    уже замечаний: {formatCount(selectedArchiveQaIssues.length)}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href="#qa-issues"
                    className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Перейти к списку замечаний
                  </Link>
                </div>

                <form action={createArchiveQaIssueAction} className="mt-6 grid gap-4">
                  <input type="hidden" name="importFileId" value={selectedFile.id} />
                  <input
                    type="hidden"
                    name="submissionId"
                    value={selectedSubmission?.id ?? ""}
                  />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={buildQaHref({
                      year: effectiveYear,
                      formCode: effectiveFormCode,
                      regionId: effectiveRegionId,
                      importFileId: selectedFile.id,
                      page: safePage,
                      problemOnly,
                      loadValues,
                    })}
                  />

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="qa-issue-type" className="text-sm font-medium text-slate-700">
                        Тип проблемы
                      </label>
                      <select
                        id="qa-issue-type"
                        name="type"
                        defaultValue="MAPPING"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                      >
                        <option value="REGION">Неверный регион / файл</option>
                        <option value="EXTRACTION">Проблема extraction</option>
                        <option value="MAPPING">Проблема mapping</option>
                        <option value="SCHEMA">Проблема структуры формы</option>
                        <option value="MANUAL">Единичная ручная правка</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="qa-issue-scale" className="text-sm font-medium text-slate-700">
                        Масштаб
                      </label>
                      <select
                        id="qa-issue-scale"
                        name="scale"
                        defaultValue="SINGLE_VALUE"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                      >
                        <option value="SINGLE_VALUE">Одно значение</option>
                        <option value="BLOCK">Блок / раздел</option>
                        <option value="FILE">Весь файл</option>
                        <option value="SYSTEMIC">Системная ошибка</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="qa-issue-title" className="text-sm font-medium text-slate-700">
                      Кратко суть проблемы
                    </label>
                    <input
                      id="qa-issue-title"
                      name="title"
                      type="text"
                      placeholder="Например: графа 9 маппится в соседнее поле"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="qa-issue-description"
                      className="text-sm font-medium text-slate-700"
                    >
                      Описание
                    </label>
                    <textarea
                      id="qa-issue-description"
                      name="description"
                      rows={4}
                      placeholder="Опишите, что именно увидел специалист и почему считает это ошибкой."
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                    />
                  </div>

                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="space-y-2">
                      <label
                        htmlFor="qa-issue-raw-evidence"
                        className="text-sm font-medium text-slate-700"
                      >
                        Что видно в raw
                      </label>
                      <textarea
                        id="qa-issue-raw-evidence"
                        name="rawEvidence"
                        rows={4}
                        placeholder="rawLabel, значение, контекст table/row/col"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="qa-issue-expected-result"
                        className="text-sm font-medium text-slate-700"
                      >
                        Что ожидалось
                      </label>
                      <textarea
                        id="qa-issue-expected-result"
                        name="expectedResult"
                        rows={4}
                        placeholder="Куда должно было попасть значение или как должна выглядеть структура"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="qa-issue-actual-result"
                        className="text-sm font-medium text-slate-700"
                      >
                        Что получилось
                      </label>
                      <textarea
                        id="qa-issue-actual-result"
                        name="actualResult"
                        rows={4}
                        placeholder="Не попало, попало не туда, искажено, отсутствует и т.д."
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-2xl bg-[#1f67ab] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#185993]"
                    >
                      Сохранить замечание
                    </button>
                  </div>
                </form>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-2xl font-semibold text-slate-950">
                        Доводка структуры формы
                      </h3>
                      <HelpHint
                        label="Пояснение к доводке структуры"
                        text="Здесь проверяющий может глобально исправить заголовки таблиц, строки и графы для всей архивной формы за выбранный год. Эти правки применяются ко всем регионам."
                      />
                    </div>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                      Инструмент нужен для ручной доводки структуры отображения, когда автоматическая
                      расшифровка оставила подписи вроде «Графа 3» или искаженные названия строк.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {selectedFile.formType?.code ?? "Форма"} / {selectedFile.reportingYear?.year ?? "Год"}
                  </div>
                </div>

                {selectedSubmission && selectedSchema ? (
                  <ArchiveStructureEditor
                    schema={parseAndNormalizeFormSchema(selectedSchema)}
                    entries={structureDraftEntries}
                    formTypeId={selectedFile.formTypeId ?? ""}
                    reportingYearId={selectedFile.reportingYearId ?? ""}
                    returnTo={buildQaHref({
                      year: effectiveYear,
                      formCode: effectiveFormCode,
                      regionId: effectiveRegionId,
                      importFileId: selectedFile.id,
                      page: safePage,
                      problemOnly,
                      loadValues,
                    })}
                    saveAction={saveArchiveStructureOverridesAction}
                  />
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    Для ручной доводки структуры нужен найденный архивный `Submission`-шаблон выбранной формы.
                  </div>
                )}
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                {!loadValues ? (
                  <section className="xl:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-2xl font-semibold text-slate-950">
                          Таблицы значений скрыты для ускорения
                        </h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                          Сначала экран открывается только с summary. Это ускоряет работу на
                          больших архивах. Если нужно сравнить сырые строки и итоговые значения,
                          открой таблицы отдельным действием.
                        </p>
                      </div>
                      <Link
                        href={buildQaHref({
                          year: effectiveYear,
                          formCode: effectiveFormCode,
                          regionId: effectiveRegionId,
                          importFileId: selectedFile.id,
                          page: safePage,
                          problemOnly,
                          loadValues: true,
                        })}
                        className="inline-flex items-center rounded-2xl bg-[#1f67ab] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#185993]"
                      >
                        Показать таблицы значений
                      </Link>
                    </div>
                  </section>
                ) : (
                  <>
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-2xl font-semibold text-slate-950">Сырые значения</h3>
                            <HelpHint
                              label="Пояснение к сырым значениям"
                              text="Первые записи из ImportFieldValue. Здесь видно, что именно было извлечено из архивного файла до попадания в форму."
                            />
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            Первые 40 строк из `ImportFieldValue` для выбранного файла.
                          </p>
                        </div>
                        <span className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                          {formatCount(selectedRawFieldValues.length)} / {formatCount(selectedRawValueCount)}
                        </span>
                      </div>

                      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
                        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                          <thead>
                            <tr>
                              {["Тег", "Raw label", "Значение", "Контекст"].map((label) => (
                                <th
                                  key={label}
                                  className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700"
                                >
                                  {label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {selectedRawFieldValues.map((fieldValue) => {
                              const context = (fieldValue.contextJson ?? {}) as {
                                tableCode?: string | null;
                                rowNo?: string | null;
                                colNo?: string | null;
                              };
                              return (
                                <tr key={fieldValue.id}>
                                  <td className="border-b border-slate-200 px-4 py-3 font-mono text-xs text-slate-700">
                                    {fieldValue.rawKey}
                                  </td>
                                  <td className="border-b border-slate-200 px-4 py-3 text-slate-700">
                                    {fieldValue.rawLabel ?? "Без подписи"}
                                  </td>
                                  <td className="border-b border-slate-200 px-4 py-3 text-slate-900">
                                    {formatPreviewValue(fieldValue)}
                                  </td>
                                  <td className="border-b border-slate-200 px-4 py-3 text-xs text-slate-500">
                                    {[context.tableCode, context.rowNo, context.colNo]
                                      .filter(Boolean)
                                      .join(" / ") || "Нет контекста"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-2xl font-semibold text-slate-950">
                              Значения после маппинга
                            </h3>
                            <HelpHint
                              label="Пояснение к значениям после маппинга"
                              text="Это уже SubmissionValue внутри рабочей формы. По этому блоку проверяют, во что превратился архивный файл после сопоставления."
                            />
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            Первые 40 `SubmissionValue`, уже приземленных в форму региона.
                          </p>
                        </div>
                        <span className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                          {formatCount(selectedSubmissionValues.length)} /{" "}
                          {formatCount(selectedSubmission?._count.values ?? 0)}
                        </span>
                      </div>

                      {selectedSubmission ? (
                        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
                          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                            <thead>
                              <tr>
                                {["Поле формы", "Ключ", "Значение"].map((label) => (
                                  <th
                                    key={label}
                                    className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700"
                                  >
                                    {label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedSubmissionValues.map((value) => (
                                <tr key={value.id}>
                                  <td className="border-b border-slate-200 px-4 py-3 text-slate-700">
                                    {value.field.label}
                                  </td>
                                  <td className="border-b border-slate-200 px-4 py-3 font-mono text-xs text-slate-500">
                                    {value.field.key}
                                  </td>
                                  <td className="border-b border-slate-200 px-4 py-3 text-slate-900">
                                    {formatPreviewValue(value)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                          Для выбранного файла пока нет связанного `SubmissionValue`-слоя.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>

              <section
                id="qa-issues"
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm scroll-mt-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-semibold text-slate-950">Замечания QA</h3>
                    <HelpHint
                      label="Пояснение к замечаниям QA"
                      text="Это уже не машинные ImportIssue, а замечания, которые вручную зафиксировали специалисты по выбранному файлу."
                    />
                  </div>
                  <span className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {formatCount(selectedArchiveQaIssues.length)}
                  </span>
                </div>

                {selectedArchiveQaIssues.length > 0 ? (
                  <div className="mt-6 space-y-3">
                    {selectedArchiveQaIssues.map((issue) => (
                      <article
                        key={issue.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                            {issue.type}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                            {issue.scale}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                            {issue.status}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatDate(issue.createdAt)}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-900">{issue.title}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                          {issue.description}
                        </p>
                        {issue.rawEvidence ? (
                          <p className="mt-3 text-sm text-slate-600">
                            <span className="font-medium text-slate-900">Raw:</span>{" "}
                            {issue.rawEvidence}
                          </p>
                        ) : null}
                        {issue.expectedResult ? (
                          <p className="mt-2 text-sm text-slate-600">
                            <span className="font-medium text-slate-900">Ожидалось:</span>{" "}
                            {issue.expectedResult}
                          </p>
                        ) : null}
                        {issue.actualResult ? (
                          <p className="mt-2 text-sm text-slate-600">
                            <span className="font-medium text-slate-900">Получилось:</span>{" "}
                            {issue.actualResult}
                          </p>
                        ) : null}
                        <p className="mt-3 text-xs text-slate-500">
                          Автор: {issue.createdByFullName ?? "Система"}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    По выбранному файлу замечания QA пока не зафиксированы.
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-semibold text-slate-950">ImportIssue</h3>
                  <HelpHint
                    label="Пояснение к ImportIssue"
                    text="Замечания, созданные на этапе staging. Помогают быстро увидеть, что в этом файле уже считалось проблемным до ручной проверки."
                  />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Последние замечания, если они были созданы на этапе staging.
                </p>

                {selectedFile.issues.length > 0 ? (
                  <div className="mt-6 space-y-3">
                    {selectedFile.issues.map((issue) => (
                      <article
                        key={issue.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                            {issue.severity}
                          </span>
                          <span className="text-xs text-slate-500">{formatDate(issue.createdAt)}</span>
                        </div>
                        <p className="mt-3 text-sm font-medium text-slate-900">{issue.message}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    ImportIssue для выбранного файла не найдено.
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

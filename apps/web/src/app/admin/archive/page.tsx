import Link from "next/link";

import {
  applyArchivePilotMappingAction,
  ensureArchiveYearlyFormsAction,
  importArchiveRawValuesAction,
  importCanonicalDocxArchiveRegistryAction,
  importCanonicalDocxValuesAction,
  importHandoffArchiveRegistryAction,
  runArchivePilotImportAction,
  syncCanonicalRegionsAction,
} from "@/app/admin/actions";
import { CANONICAL_DOCX_BATCH_NAME } from "@/lib/archive/docx";
import { HANDOFF_BATCH_NAME } from "@/lib/archive/service";
import {
  loadHandoffDocScopeEntries,
  loadHandoffSubjects,
  normalizeCanonText,
} from "@/lib/archive/handoff";
import { getArchiveDashboardSnapshot } from "@/lib/archive/admin-dashboard";
import { requireSuperadmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const targetYears = [2019, 2020, 2021, 2022, 2023, 2024];

function formatCount(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function extractRegionOktmoKey(region: { code: string; subjectOktmoKey: string | null }) {
  if (region.subjectOktmoKey) {
    return region.subjectOktmoKey;
  }

  return region.code.startsWith("OKTMO_") ? region.code.slice("OKTMO_".length) : null;
}

function parseNotice(
  value: string | string[] | undefined,
  expectedLength: number,
) {
  if (typeof value !== "string") {
    return null;
  }

  const decoded = decodeURIComponent(value).split("|");
  return decoded.length >= expectedLength ? decoded : null;
}

export default async function AdminArchivePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperadmin();

  const [
    params,
    subjects,
    docScopeEntries,
    regions,
    formTypes,
    batch,
    docxBatch,
    dashboardSnapshot,
  ] = await Promise.all([
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
    loadHandoffSubjects(),
    loadHandoffDocScopeEntries(),
    prisma.region.findMany({
      select: {
        id: true,
        code: true,
        subjectOktmoKey: true,
        fullName: true,
        shortName: true,
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.formType.findMany({
      orderBy: { code: "asc" },
    }),
    prisma.importBatch.findUnique({
      where: { id: HANDOFF_BATCH_NAME },
      select: {
        name: true,
      },
    }),
    prisma.importBatch.findUnique({
      where: { id: CANONICAL_DOCX_BATCH_NAME },
      select: {
        name: true,
      },
    }),
    getArchiveDashboardSnapshot(),
  ]);

  const {
    docxImportMetricsRows,
    docxOverallImportMetrics,
    versionCountRows,
    importMetricsRows,
    overallImportMetrics,
    submissionCoverageRows,
    docxQaBacklogRows,
  } = dashboardSnapshot;

  const synced = parseNotice(params.synced, 5);
  const registryImported = parseNotice(params.registryImported, 5);
  const docxRegistryImported = parseNotice(params.docxRegistryImported, 6);
  const yearlyFormsReady = parseNotice(params.yearlyFormsReady, 3);
  const pilotImported = parseNotice(params.pilotImported, 7);
  const valuesImported = parseNotice(params.valuesImported, 7);
  const docxValuesImported = parseNotice(params.docxValuesImported, 7);
  const mappingApplied = parseNotice(params.mappingApplied, 7);
  const error = typeof params.error === "string" ? decodeURIComponent(params.error) : null;

  const regionNameSet = new Set(
    regions.map((region) => normalizeCanonText(region.fullName)).filter(Boolean),
  );
  const regionOktmoKeySet = new Set(
    regions.map((region) => extractRegionOktmoKey(region)).filter((value): value is string => Boolean(value)),
  );
  const handoffDocCountByKey = new Map<string, number>();
  let subjectEntries = 0;
  let scopeEntries = 0;
  for (const entry of docScopeEntries) {
    const key = `${entry.year}-${entry.form}`;
    handoffDocCountByKey.set(key, (handoffDocCountByKey.get(key) ?? 0) + 1);
    if (entry.resolvedKind === "SUBJECT") {
      subjectEntries += 1;
    } else {
      scopeEntries += 1;
    }
  }
  const matchedCanonicalSubjects = subjects.filter(
    (subject) =>
      regionOktmoKeySet.has(subject.subjectOktmoKey) ||
      regionNameSet.has(normalizeCanonText(subject.canonicalName)),
  ).length;
  const totals = overallImportMetrics[0] ?? {
    importedDocs: BigInt(0),
    importedSubjectFiles: BigInt(0),
    extractedFiles: BigInt(0),
    extractedValues: BigInt(0),
  };
  const docxTotals = docxOverallImportMetrics[0] ?? {
    importedDocs: BigInt(0),
    importedSubjectFiles: BigInt(0),
    scopeFiles: BigInt(0),
    unmatchedSubjectFiles: BigInt(0),
    extractedFiles: BigInt(0),
    extractedValues: BigInt(0),
    structureSignatures: BigInt(0),
  };
  const importedSubjectFiles = Number(totals.importedSubjectFiles);
  const extractedFiles = Number(totals.extractedFiles);
  const extractedValues = Number(totals.extractedValues);
  const totalImportFiles = Number(totals.importedDocs);
  const docxImportedFiles = Number(docxTotals.importedDocs);
  const docxImportedSubjectFiles = Number(docxTotals.importedSubjectFiles);
  const docxScopeFiles = Number(docxTotals.scopeFiles);
  const docxUnmatchedSubjectFiles = Number(docxTotals.unmatchedSubjectFiles);
  const docxExtractedFiles = Number(docxTotals.extractedFiles);
  const docxExtractedValues = Number(docxTotals.extractedValues);
  const docxStructureSignatures = Number(docxTotals.structureSignatures);
  const docxQaBacklog = Number(docxQaBacklogRows[0]?.qaBacklog ?? BigInt(0));
  const submissionCoverageByKey = new Map(
    submissionCoverageRows.map((row) => [
      `${row.year}-${row.formCode}`,
      {
        regionSubmissions: Number(row.regionSubmissions),
        mappedSubmissions: Number(row.mappedSubmissions),
        mappedValues: Number(row.mappedValues),
      },
    ]),
  );
  const versionCountByKey = new Map(
    versionCountRows.map((row) => [`${row.year}-${row.formCode}`, Number(row.versionCount)]),
  );
  const importMetricsByKey = new Map(
    importMetricsRows.map((row) => [
      `${row.year}-${row.formCode}`,
      {
        importedDocs: Number(row.importedDocs),
        extractedDocs: Number(row.extractedDocs),
        distinctRegions: Number(row.distinctRegions),
        duplicateSubjectFiles: Number(row.duplicateSubjectFiles),
        nullRegionFiles: Number(row.nullRegionFiles),
        stagedValues: Number(row.stagedValues),
      },
    ]),
  );
  const docxImportMetricsByKey = new Map(
    docxImportMetricsRows.map((row) => [
      `${row.year}-${row.formCode}`,
      {
        subjectDocs: Number(row.subjectDocs),
        scopeDocs: Number(row.scopeDocs),
        unmatchedSubjectDocs: Number(row.unmatchedSubjectDocs),
        extractedDocs: Number(row.extractedDocs),
        distinctRegions: Number(row.distinctRegions),
        duplicateSubjectFiles: Number(row.duplicateSubjectFiles),
        nullRegionFiles: Number(row.nullRegionFiles),
        stagedValues: Number(row.stagedValues),
        structureSignatures: Number(row.structureSignatures),
      },
    ]),
  );

  const matrixRows = targetYears.flatMap((year) =>
    formTypes.map((formType) => {
      const importMetrics =
        importMetricsByKey.get(`${year}-${formType.code}`) ?? {
          importedDocs: 0,
          extractedDocs: 0,
          distinctRegions: 0,
          duplicateSubjectFiles: 0,
          nullRegionFiles: 0,
          stagedValues: 0,
        };
      const coverage =
        submissionCoverageByKey.get(`${year}-${formType.code}`) ?? {
          regionSubmissions: 0,
          mappedSubmissions: 0,
          mappedValues: 0,
        };
      const handoffDocs = handoffDocCountByKey.get(`${year}-${formType.code}`) ?? 0;
      const importedDocs = importMetrics.importedDocs;
      const versionCount = versionCountByKey.get(`${year}-${formType.code}`) ?? 0;

      return {
        key: `${year}-${formType.code}`,
        year,
        formCode: formType.code,
        handoffDocs,
        importedDocs,
        extractedDocs: importMetrics.extractedDocs,
        distinctRegions: importMetrics.distinctRegions,
        duplicateSubjectFiles: importMetrics.duplicateSubjectFiles,
        nullRegionFiles: importMetrics.nullRegionFiles,
        stagedValues: importMetrics.stagedValues,
        versionCount,
        regionSubmissions: coverage.regionSubmissions,
        mappedSubmissions: coverage.mappedSubmissions,
        mappedValues: coverage.mappedValues,
      };
    }),
  );
  const fullyCoveredRows = matrixRows.filter(
    (row) => row.distinctRegions > 0 && row.mappedSubmissions >= row.distinctRegions,
  ).length;
  const totalMappedSubmissions = matrixRows.reduce((sum, row) => sum + row.mappedSubmissions, 0);
  const totalSubmissionValues = matrixRows.reduce((sum, row) => sum + row.mappedValues, 0);
  const totalArchiveAnomalies = matrixRows.reduce(
    (sum, row) => sum + row.duplicateSubjectFiles + row.nullRegionFiles,
    0,
  );
  const docxMatrixRows = targetYears.flatMap((year) =>
    formTypes.map((formType) => {
      const metrics =
        docxImportMetricsByKey.get(`${year}-${formType.code}`) ?? {
          subjectDocs: 0,
          scopeDocs: 0,
          unmatchedSubjectDocs: 0,
          extractedDocs: 0,
          distinctRegions: 0,
          duplicateSubjectFiles: 0,
          nullRegionFiles: 0,
          stagedValues: 0,
          structureSignatures: 0,
        };
      const coverage =
        submissionCoverageByKey.get(`${year}-${formType.code}`) ?? {
          regionSubmissions: 0,
          mappedSubmissions: 0,
          mappedValues: 0,
        };

      return {
        key: `docx-${year}-${formType.code}`,
        year,
        formCode: formType.code,
        subjectDocs: metrics.subjectDocs,
        scopeDocs: metrics.scopeDocs,
        unmatchedSubjectDocs: metrics.unmatchedSubjectDocs,
        extractedDocs: metrics.extractedDocs,
        distinctRegions: metrics.distinctRegions,
        duplicateSubjectFiles: metrics.duplicateSubjectFiles,
        nullRegionFiles: metrics.nullRegionFiles,
        stagedValues: metrics.stagedValues,
        structureSignatures: metrics.structureSignatures,
        mappedSubmissions: coverage.mappedSubmissions,
        mappedValues: coverage.mappedValues,
      };
    }),
  );
  const dashboardMetrics = [
    {
      label: "Субъекты из handoff",
      value: subjects.length,
      help: "Сколько канонических субъектов РФ пришло из handoff-источника.",
    },
    {
      label: "Совпало с Region",
      value: matchedCanonicalSubjects,
      help: "Сколько субъектов из handoff уже корректно сопоставлено с регионами приложения.",
    },
    {
      label: "Документы SUBJECT",
      value: subjectEntries,
      help: "Архивные документы уровня конкретного региона. Это основной слой для исторической загрузки.",
    },
    {
      label: "Документы SCOPE",
      value: scopeEntries,
      help: "Агрегированные документы: округа, своды и другие контуры вне одного региона.",
    },
    {
      label: "Файлов в registry",
      value: totalImportFiles,
      help: "Сколько записей об архивных документах уже занесено во внутренний registry приложения.",
    },
    {
      label: "EXTRACTED файлов",
      value: extractedFiles,
      help: "Сколько файлов уже прошло этап извлечения и готово к импорту значений и маппингу.",
    },
    {
      label: "Значений в staging",
      value: extractedValues,
      help: "Это сырой промежуточный слой ImportFieldValue. Он хранит почти все извлеченные ячейки до фильтрации и поэтому всегда сильно больше финальных значений.",
    },
    {
      label: "Полных слотов форма/год",
      value: fullyCoveredRows,
      help: "Сколько комбинаций форма+год уже имеют полное региональное покрытие по доступным EXTRACTED-данным.",
    },
    {
      label: "Замапленных submission",
      value: totalMappedSubmissions,
      help: "Сколько региональных исторических черновиков уже реально наполнено данными.",
    },
    {
      label: "SubmissionValue в архиве",
      value: totalSubmissionValues,
      help: "Сколько финальных значений уже приземлено в рабочую модель приложения.",
    },
    {
      label: "Дубли/без региона",
      value: totalArchiveAnomalies,
      help: "Проблемные записи staging: дубли одного региона и файлы, где регион не определился.",
    },
  ];
  const docxDashboardMetrics = [
    {
      label: "DOCX files in registry",
      value: docxImportedFiles,
      help: "Сколько реальных DOCX-файлов уже занесено в канонический ImportBatch, включая subject и scope.",
    },
    {
      label: "DOCX subject matched",
      value: docxImportedSubjectFiles,
      help: "Сколько subject-level DOCX уже сопоставлены с Region и могут участвовать в региональном архиве.",
    },
    {
      label: "DOCX scope files",
      value: docxScopeFiles,
      help: "Сколько файлов канонического DOCX batch распознано как aggregate/scope слой и исключено из регионального покрытия.",
    },
    {
      label: "DOCX subject unmatched",
      value: docxUnmatchedSubjectFiles,
      help: "Сколько subject-level DOCX пока остаются без сопоставления с Region.",
    },
    {
      label: "DOCX extracted",
      value: docxExtractedFiles,
      help: "Сколько DOCX уже прошли Python extraction и попали в staging.",
    },
    {
      label: "DOCX staging values",
      value: docxExtractedValues,
      help: "Количество сырых ImportFieldValue, извлеченных напрямую из DOCX.",
    },
    {
      label: "Structure signatures",
      value: docxStructureSignatures,
      help: "Сколько уникальных структур форм обнаружено по extracted DOCX.",
    },
    {
      label: "DOCX QA backlog",
      value: docxQaBacklog,
      help: "Открытые Archive QA issues, относящиеся к каноническому DOCX batch.",
    },
  ];

  const pilotOptions = formTypes.map((formType) => formType.code);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Сервисный раздел
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
              Сервисный раздел импорта
            </h1>
            <p className="mt-3 max-w-4xl text-slate-600">
              Технический экран обслуживания архива: импорт, синхронизация, подготовка версий,
              извлечение значений и pilot mapping. Основная повседневная работа с архивом теперь
              ведется на отдельном рабочем экране.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 xl:items-end">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Batch: {batch?.name ?? HANDOFF_BATCH_NAME}
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Canonical DOCX batch: {docxBatch?.name ?? CANONICAL_DOCX_BATCH_NAME}
            </div>
            <Link
              href="/admin/archive/qa"
              className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Открыть Архив
            </Link>
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
        {synced ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Канонические регионы синхронизированы: субъектов {synced[0]}, повторно
            использовано {synced[1]}, создано новых регионов {synced[2]}, создано
            региональных центров {synced[3]}, перепривязано архивных файлов {synced[4]}.
          </p>
        ) : null}
        {registryImported ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Реестр handoff импортирован: всего записей {registryImported[0]}, новых{" "}
            {registryImported[1]}, обновлено {registryImported[2]}, сопоставлено субъектов{" "}
            {registryImported[3]}, без региона {registryImported[4]}.
          </p>
        ) : null}
        {docxRegistryImported ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Реестр канонических DOCX импортирован: файлов {docxRegistryImported[0]}, новых{" "}
            {docxRegistryImported[1]}, обновлено {docxRegistryImported[2]}, subject match{" "}
            {docxRegistryImported[3]}, subject без match {docxRegistryImported[4]}, scope{" "}
            {docxRegistryImported[5]}.
          </p>
        ) : null}
        {yearlyFormsReady ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Годовые формы подготовлены: целевых лет {yearlyFormsReady[0]}, новых шаблонов{" "}
            {yearlyFormsReady[1]}, создано версий {yearlyFormsReady[2]}.
          </p>
        ) : null}
        {pilotImported ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Пилот batch `{pilotImported[0]}` / {pilotImported[1]} / {pilotImported[2]}:
            кандидатов {pilotImported[3]}, назначений создано {pilotImported[4]}, черновиков
            региона {pilotImported[5]}, без регионального центра {pilotImported[6]}.
          </p>
        ) : null}
        {valuesImported ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Raw values imported из batch `{valuesImported[0]}`: {valuesImported[1]} /{" "}
            {valuesImported[2]}, выбрано файлов {valuesImported[3]}, обработано{" "}
            {valuesImported[4]}, значений {valuesImported[5]}, без семантики{" "}
            {valuesImported[6]}.
          </p>
        ) : null}
        {docxValuesImported ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Canonical DOCX extraction: {docxValuesImported[0]} / {docxValuesImported[1]},
            выбрано файлов {docxValuesImported[2]}, обработано {docxValuesImported[3]},
            значений {docxValuesImported[4]}, без семантики {docxValuesImported[5]}, уникальных
            структур {docxValuesImported[6]}.
          </p>
        ) : null}
        {mappingApplied ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Pilot mapping batch `{mappingApplied[0]}` / {mappingApplied[1]} / {mappingApplied[2]}
            : файлов {mappingApplied[3]}, черновиков обновлено {mappingApplied[4]}, значений
            загружено в SubmissionValue {mappingApplied[5]}, без уверенного match{" "}
            {mappingApplied[6]}.
          </p>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {dashboardMetrics.map((metric) => (
            <article
              key={metric.label}
              className="rounded-3xl border border-[#2e78be] bg-[#1f67ab] p-5 text-white"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-blue-100">{metric.label}</p>
                <details className="group relative shrink-0">
                  <summary
                    aria-label={`Пояснение к метрике ${metric.label}`}
                    className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-white/35 bg-white/10 text-xs font-semibold text-white transition hover:bg-white/20"
                  >
                    ?
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-64 rounded-2xl bg-white p-3 text-xs leading-5 text-slate-700 shadow-2xl ring-1 ring-slate-200">
                    {metric.help}
                  </div>
                </details>
              </div>
              <p className="mt-3 text-3xl font-semibold">{formatCount(metric.value)}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {docxDashboardMetrics.map((metric) => (
            <article
              key={metric.label}
              className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-emerald-700">{metric.label}</p>
                <details className="group relative shrink-0">
                  <summary
                    aria-label={`Пояснение к метрике ${metric.label}`}
                    className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-emerald-300 bg-white/70 text-xs font-semibold text-emerald-800 transition hover:bg-white"
                  >
                    ?
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-64 rounded-2xl bg-white p-3 text-xs leading-5 text-slate-700 shadow-2xl ring-1 ring-slate-200">
                    {metric.help}
                  </div>
                </details>
              </div>
              <p className="mt-3 text-3xl font-semibold">{formatCount(metric.value)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-950">Операции подготовки</h2>
          <p className="mt-2 max-w-3xl text-slate-600">
            Эти действия реализуют дорожную карту архива по шагам: сначала канон
            регионов, затем реестр handoff, после этого годовые версии форм и только потом
            пилотный запуск региональных архивных черновиков.
          </p>

          <div className="mt-6 grid gap-4">
            <form action={syncCanonicalRegionsAction} className="rounded-2xl bg-slate-50 p-4">
              <input type="hidden" name="returnTo" value="/admin/archive" />
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    1. Синхронизировать канонические регионы
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Загружает субъекты из `rf_subjects_oktmo.csv`, обновляет `Region` и
                    гарантирует наличие `REGION_CENTER`.
                  </p>
                </div>
                <button
                  type="submit"
                  className="rounded-2xl bg-[#1f67ab] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#185993]"
                >
                  Синхронизировать
                </button>
              </div>
            </form>

            <form
              action={importHandoffArchiveRegistryAction}
              className="rounded-2xl bg-slate-50 p-4"
            >
              <input type="hidden" name="returnTo" value="/admin/archive" />
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    2. Импортировать реестр handoff
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Переносит `v_doc_scope_canon.csv` в `ImportBatch`/`ImportFile` и делит
                    SUBJECT/SCOPE без использования сырых `subject_alias`.
                  </p>
                </div>
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Импортировать registry
                </button>
              </div>
            </form>

            <form
              action={importCanonicalDocxArchiveRegistryAction}
              className="rounded-2xl bg-emerald-50 p-4"
            >
              <input type="hidden" name="returnTo" value="/admin/archive" />
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    2b. Импортировать канонический DOCX-реестр
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Сканирует `C:\python_projects\statforms_raw` и `statforms_docx_2024`,
                    строит checksum-based registry и сопоставляет файлы с регионами приложения.
                  </p>
                </div>
                <button
                  type="submit"
                  className="rounded-2xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800"
                >
                  Импортировать DOCX registry
                </button>
              </div>
            </form>

            <form
              action={ensureArchiveYearlyFormsAction}
              className="rounded-2xl bg-slate-50 p-4"
            >
              <input type="hidden" name="returnTo" value="/admin/archive" />
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    3. Подготовить формы 2019-2024
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Создает недостающие `ReportingYear` и `FormTemplateVersion` на базе
                    текущих шаблонов.
                  </p>
                </div>
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Подготовить версии
                </button>
              </div>
            </form>

            <form action={runArchivePilotImportAction} className="rounded-2xl bg-slate-50 p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_180px_180px_180px] xl:items-end">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    4. Запустить пилот региональных черновиков
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Создает назначения `REGION_CENTER` и архивные `Submission`-заготовки
                    по одному коду формы и одному году. Значения потом можно догрузить
                    маппингом или ввести вручную регионом.
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="formCode" className="text-sm font-medium text-slate-700">
                    Форма
                  </label>
                  <select
                    id="formCode"
                    name="formCode"
                    defaultValue={pilotOptions[0]}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    {pilotOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="pilotBatchId" className="text-sm font-medium text-slate-700">
                    Источник
                  </label>
                  <select
                    id="pilotBatchId"
                    name="batchId"
                    defaultValue={CANONICAL_DOCX_BATCH_NAME}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    <option value={HANDOFF_BATCH_NAME}>handoff</option>
                    <option value={CANONICAL_DOCX_BATCH_NAME}>canonical-docx</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="year" className="text-sm font-medium text-slate-700">
                    Год
                  </label>
                  <div className="flex gap-3">
                    <select
                      id="year"
                      name="year"
                      defaultValue="2024"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                    >
                      {targetYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-2xl bg-[#1f67ab] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#185993]"
                    >
                      Запустить
                    </button>
                  </div>
                </div>
              </div>
            </form>

            <form action={importArchiveRawValuesAction} className="rounded-2xl bg-slate-50 p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_160px_160px_160px] xl:items-end">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    5. Импортировать raw значения из handoff PostgreSQL
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Читает `stg_values` и `semantic_passports_final_v2`, заполняет
                    `ImportFieldValue` для уже импортированных `ImportFile`. Для запуска
                    нужна восстановленная handoff-база и `HANDOFF_DATABASE_URL` либо
                    `DATABASE_URL` с доступной схемой `statforms`.
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="valueFormCode" className="text-sm font-medium text-slate-700">
                    Форма
                  </label>
                  <select
                    id="valueFormCode"
                    name="formCode"
                    defaultValue={pilotOptions[0]}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    {pilotOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="valueYear" className="text-sm font-medium text-slate-700">
                    Год
                  </label>
                  <select
                    id="valueYear"
                    name="year"
                    defaultValue="2024"
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
                  <label htmlFor="valueLimit" className="text-sm font-medium text-slate-700">
                    Лимит файлов
                  </label>
                  <div className="flex gap-3">
                    <input
                      id="valueLimit"
                      name="limit"
                      type="number"
                      min={1}
                      max={500}
                      defaultValue={25}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                    />
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Импортировать
                    </button>
                  </div>
                </div>
              </div>
            </form>

            <form action={importCanonicalDocxValuesAction} className="rounded-2xl bg-emerald-50 p-4">
              <input type="hidden" name="batchId" value={CANONICAL_DOCX_BATCH_NAME} />
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_160px_160px_160px] xl:items-end">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    5b. Извлечь raw значения из канонических DOCX
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Для каждого выбранного DOCX вызывает Python extractor и passport builder,
                    объединяет `xml_tag + value + table/row/column context` и заполняет
                    `ImportFieldValue` напрямую из документа.
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="docxValueFormCode" className="text-sm font-medium text-slate-700">
                    Форма
                  </label>
                  <select
                    id="docxValueFormCode"
                    name="formCode"
                    defaultValue={pilotOptions[0]}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    {pilotOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="docxValueYear" className="text-sm font-medium text-slate-700">
                    Год
                  </label>
                  <select
                    id="docxValueYear"
                    name="year"
                    defaultValue="2024"
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
                  <label htmlFor="docxValueLimit" className="text-sm font-medium text-slate-700">
                    Лимит файлов
                  </label>
                  <div className="flex gap-3">
                    <input
                      id="docxValueLimit"
                      name="limit"
                      type="number"
                      min={1}
                      max={200}
                      defaultValue={10}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                    />
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-800"
                    >
                      Извлечь
                    </button>
                  </div>
                </div>
              </div>
            </form>

            <form action={applyArchivePilotMappingAction} className="rounded-2xl bg-slate-50 p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_160px_160px_160px_160px] xl:items-end">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    {"6. Применить pilot mapping -> SubmissionValue"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Безопасный пилотный маппинг для `F12/F14/F19/F30/F47`: берет уже
                    загруженные `ImportFieldValue`, сопоставляет их с полями архивной
                    структуры и переносит только уверенные совпадения в региональные
                    `SubmissionValue`.
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="mappingFormCode" className="text-sm font-medium text-slate-700">
                    Форма
                  </label>
                  <select
                    id="mappingFormCode"
                    name="formCode"
                    defaultValue={pilotOptions[0]}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    {pilotOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="mappingYear" className="text-sm font-medium text-slate-700">
                    Год
                  </label>
                  <select
                    id="mappingYear"
                    name="year"
                    defaultValue="2024"
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
                  <label htmlFor="mappingBatchId" className="text-sm font-medium text-slate-700">
                    Источник
                  </label>
                  <select
                    id="mappingBatchId"
                    name="batchId"
                    defaultValue={CANONICAL_DOCX_BATCH_NAME}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    <option value={HANDOFF_BATCH_NAME}>handoff</option>
                    <option value={CANONICAL_DOCX_BATCH_NAME}>canonical-docx</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="mappingLimit" className="text-sm font-medium text-slate-700">
                    Лимит файлов
                  </label>
                  <div className="flex gap-3">
                    <input
                      id="mappingLimit"
                      name="limit"
                      type="number"
                      min={1}
                      max={500}
                      defaultValue={10}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                    />
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-2xl bg-[#1f67ab] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#185993]"
                    >
                      Применить
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-950">Карта соответствия</h2>
          <div className="mt-6 space-y-4 text-sm leading-6 text-slate-600">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{'`rf_subjects_oktmo` -> `Region`'}</p>
              <p className="mt-1">
                Канонический список субъектов. Используется для синхронизации регионов и
                проверки полноты локального справочника.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{'`v_doc_scope_canon` -> `ImportFile`'}</p>
              <p className="mt-1">
                Реестр документов попадает в staging-слой через `ImportBatch` и `ImportFile`.
                SUBJECT записи маппятся на `Region`, SCOPE остаются агрегированным слоем.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">
                `FormType` / `ReportingYear` / `FormTemplateVersion`
              </p>
              <p className="mt-1">
                Годовые версии форм создаются заранее, чтобы исторические записи было куда
                приземлять даже до финального маппинга полей.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">
                {'`REGION_CENTER` assignment -> `Submission`'}
              </p>
              <p className="mt-1">
                Для subject-level архива пилот создает региональные черновики. Это дает
                единый сценарий: архивный shell и новый ручной ввод регионом выглядят
                одинаково на уровне модели.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Покрытие по годам и формам</h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              Таблица показывает не только handoff/registry, но и фактическое покрытие по
              регионам. Процент считается по уникальным `regionId` среди `EXTRACTED`, поэтому
              дубли файлов и записи без региона не искажают статус загрузки.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Файлов в batch: {totalImportFiles}, subject-level в registry:{" "}
            {importedSubjectFiles}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-200">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                {[
                  "Год",
                  "Форма",
                  "Документов handoff",
                  "В registry",
                  "EXTRACTED",
                  "Регионов",
                  "Staging values",
                  "Версии",
                  "Submission coverage",
                  "SubmissionValue",
                  "Статус",
                ].map((label) => (
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
              {matrixRows.map((row) => (
                <tr key={row.key}>
                  <td className="border-b border-slate-200 px-4 py-3 text-slate-900">
                    {row.year}
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3 font-medium text-[#1f67ab]">
                    {row.formCode}
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3 text-slate-700">
                    {row.handoffDocs}
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3 text-slate-700">
                    {row.importedDocs}
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3 text-slate-700">
                    {row.extractedDocs}
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3 text-slate-700">
                    <div className="flex flex-col gap-1">
                      <span>{row.distinctRegions}</span>
                      {row.duplicateSubjectFiles > 0 || row.nullRegionFiles > 0 ? (
                        <span className="text-xs text-amber-700">
                          {[
                            row.duplicateSubjectFiles > 0
                              ? `дублей: ${row.duplicateSubjectFiles}`
                              : null,
                            row.nullRegionFiles > 0 ? `без региона: ${row.nullRegionFiles}` : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3 text-slate-700">
                    {row.stagedValues}
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        row.versionCount > 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {row.versionCount > 0 ? `${row.versionCount} готово` : "Не подготовлено"}
                    </span>
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3 text-slate-700">
                    {row.mappedSubmissions}/{row.distinctRegions || row.regionSubmissions || 0}
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3 text-slate-700">
                    {row.mappedValues}
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        row.distinctRegions > 0 && row.mappedSubmissions >= row.distinctRegions
                          ? "bg-emerald-50 text-emerald-700"
                          : row.mappedSubmissions > 0
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {row.distinctRegions > 0 && row.mappedSubmissions >= row.distinctRegions
                        ? "Полное покрытие"
                        : row.mappedSubmissions > 0
                          ? "Частично"
                          : "Не загружено"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">
              Канонический DOCX quality matrix
            </h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              Этот срез показывает качество нового upstream прямо по реальным DOCX: сколько
              файлов найдено, сколько extracted, сколько регионов покрыто и сколько уникальных
              structure signatures обнаружено по каждой форме и году.
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            DOCX batch files: {docxImportedFiles}, extracted: {docxExtractedFiles}, QA backlog:{" "}
            {docxQaBacklog}, scope: {docxScopeFiles}, subject без match:{" "}
            {docxUnmatchedSubjectFiles}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-emerald-200">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                {[
                  "Год",
                  "Форма",
                  "Subject docs",
                  "Scope docs",
                  "Subject без match",
                  "EXTRACTED",
                  "Регионов",
                  "Staging values",
                  "Structure signatures",
                  "Submission coverage",
                  "SubmissionValue",
                ].map((label) => (
                  <th
                    key={label}
                    className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 font-medium text-emerald-900"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docxMatrixRows.map((row) => (
                <tr key={row.key}>
                  <td className="border-b border-emerald-100 px-4 py-3 text-slate-900">
                    {row.year}
                  </td>
                  <td className="border-b border-emerald-100 px-4 py-3 font-medium text-emerald-800">
                    {row.formCode}
                  </td>
                  <td className="border-b border-emerald-100 px-4 py-3 text-slate-700">
                    {row.subjectDocs}
                  </td>
                  <td className="border-b border-emerald-100 px-4 py-3 text-slate-700">
                    {row.scopeDocs}
                  </td>
                  <td className="border-b border-emerald-100 px-4 py-3 text-slate-700">
                    {row.unmatchedSubjectDocs}
                  </td>
                  <td className="border-b border-emerald-100 px-4 py-3 text-slate-700">
                    {row.extractedDocs}
                  </td>
                  <td className="border-b border-emerald-100 px-4 py-3 text-slate-700">
                    <div className="flex flex-col gap-1">
                      <span>{row.distinctRegions}</span>
                      {row.duplicateSubjectFiles > 0 || row.nullRegionFiles > 0 ? (
                        <span className="text-xs text-amber-700">
                          {[
                            row.duplicateSubjectFiles > 0
                              ? `дублей: ${row.duplicateSubjectFiles}`
                              : null,
                            row.nullRegionFiles > 0 ? `без региона: ${row.nullRegionFiles}` : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="border-b border-emerald-100 px-4 py-3 text-slate-700">
                    {row.stagedValues}
                  </td>
                  <td className="border-b border-emerald-100 px-4 py-3 text-slate-700">
                    {row.structureSignatures}
                  </td>
                  <td className="border-b border-emerald-100 px-4 py-3 text-slate-700">
                    {row.mappedSubmissions}/{row.distinctRegions || 0}
                  </td>
                  <td className="border-b border-emerald-100 px-4 py-3 text-slate-700">
                    {row.mappedValues}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

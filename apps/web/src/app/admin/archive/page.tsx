import {
  applyArchiveF12MappingAction,
  ensureArchiveYearlyFormsAction,
  importArchiveRawValuesAction,
  importHandoffArchiveRegistryAction,
  runArchivePilotImportAction,
  syncCanonicalRegionsAction,
} from "@/app/admin/actions";
import { HANDOFF_BATCH_NAME } from "@/lib/archive/service";
import {
  loadHandoffDocScopeEntries,
  loadHandoffSubjects,
  normalizeCanonText,
} from "@/lib/archive/handoff";
import { requireSuperadmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const targetYears = [2019, 2020, 2021, 2022, 2023, 2024];

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

  const [params, subjects, docScopeEntries, regions, formTypes, versions, batch, importFiles] =
    await Promise.all([
      searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
      loadHandoffSubjects(),
      loadHandoffDocScopeEntries(),
      prisma.region.findMany({
        orderBy: { fullName: "asc" },
      }),
      prisma.formType.findMany({
        orderBy: { code: "asc" },
      }),
      prisma.formTemplateVersion.findMany({
        include: {
          template: {
            include: {
              formType: true,
            },
          },
          reportingYear: true,
        },
      }),
      prisma.importBatch.findUnique({
        where: { id: HANDOFF_BATCH_NAME },
        include: {
          files: {
            include: {
              formType: true,
              region: true,
              reportingYear: true,
            },
          },
        },
      }),
      prisma.importFile.findMany({
        where: {
          batchId: HANDOFF_BATCH_NAME,
        },
        include: {
          formType: true,
          region: true,
          reportingYear: true,
        },
      }),
    ]);

  const synced = parseNotice(params.synced, 4);
  const registryImported = parseNotice(params.registryImported, 5);
  const yearlyFormsReady = parseNotice(params.yearlyFormsReady, 3);
  const pilotImported = parseNotice(params.pilotImported, 6);
  const valuesImported = parseNotice(params.valuesImported, 6);
  const mappingApplied = parseNotice(params.mappingApplied, 5);
  const error = typeof params.error === "string" ? decodeURIComponent(params.error) : null;

  const regionNameSet = new Set(
    regions.map((region) => normalizeCanonText(region.fullName)).filter(Boolean),
  );
  const matchedCanonicalSubjects = subjects.filter((subject) =>
    regionNameSet.has(normalizeCanonText(subject.canonicalName)),
  ).length;
  const subjectEntries = docScopeEntries.filter((entry) => entry.resolvedKind === "SUBJECT");
  const scopeEntries = docScopeEntries.filter((entry) => entry.resolvedKind === "SCOPE");
  const importedSubjectFiles = importFiles.filter((file) => file.regionId).length;
  const extractedFiles = importFiles.filter((file) => file.status === "EXTRACTED").length;
  const extractedValues = importFiles.reduce((sum, file) => {
    const payload = file.extractedPayload as { totalValues?: number } | null;
    return sum + (payload?.totalValues ?? 0);
  }, 0);

  const matrixRows = targetYears.flatMap((year) =>
    formTypes.map((formType) => {
      const handoffDocs = docScopeEntries.filter(
        (entry) => entry.year === year && entry.form === formType.code,
      ).length;
      const importedDocs = importFiles.filter(
        (file) => file.reportingYear?.year === year && file.formType?.code === formType.code,
      ).length;
      const versionCount = versions.filter(
        (version) =>
          version.reportingYear.year === year && version.template.formType.code === formType.code,
      ).length;

      return {
        key: `${year}-${formType.code}`,
        year,
        formCode: formType.code,
        handoffDocs,
        importedDocs,
        versionCount,
      };
    }),
  );

  const pilotOptions = formTypes.map((formType) => formType.code);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Handoff archive
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
              Архив 2019-2024
            </h1>
            <p className="mt-3 max-w-4xl text-slate-600">
              Раздел связывает handoff-базу из `db` с нашей рабочей моделью: канонические
              регионы, архивный реестр документов, годовые версии форм и пилотные
              региональные заготовки для последующего заполнения и маппинга значений.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Batch: {batch?.name ?? HANDOFF_BATCH_NAME}
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
        {synced ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Канонические регионы синхронизированы: субъектов {synced[0]}, повторно
            использовано {synced[1]}, создано новых регионов {synced[2]}, создано
            региональных центров {synced[3]}.
          </p>
        ) : null}
        {registryImported ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Реестр handoff импортирован: всего записей {registryImported[0]}, новых{" "}
            {registryImported[1]}, обновлено {registryImported[2]}, сопоставлено субъектов{" "}
            {registryImported[3]}, без региона {registryImported[4]}.
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
            Пилот {pilotImported[0]} / {pilotImported[1]}: кандидатов {pilotImported[2]},
            назначений создано {pilotImported[3]}, черновиков региона {pilotImported[4]},
            без регионального центра {pilotImported[5]}.
          </p>
        ) : null}
        {valuesImported ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Raw values imported: {valuesImported[0]} / {valuesImported[1]}, выбрано файлов{" "}
            {valuesImported[2]}, обработано {valuesImported[3]}, значений {valuesImported[4]},
            без семантики {valuesImported[5]}.
          </p>
        ) : null}
        {mappingApplied ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Pilot mapping F12/{mappingApplied[0]}: файлов {mappingApplied[1]}, черновиков
            обновлено {mappingApplied[2]}, значений загружено в SubmissionValue{" "}
            {mappingApplied[3]}, без уверенного match {mappingApplied[4]}.
          </p>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Субъекты из handoff", value: subjects.length },
            { label: "Совпало с Region", value: matchedCanonicalSubjects },
            { label: "Документы SUBJECT", value: subjectEntries.length },
            { label: "Документы SCOPE", value: scopeEntries.length },
            { label: "Файлов в registry", value: importFiles.length },
            { label: "EXTRACTED файлов", value: extractedFiles },
            { label: "Значений в staging", value: extractedValues },
          ].map((metric) => (
            <article
              key={metric.label}
              className="rounded-3xl border border-[#2e78be] bg-[#1f67ab] p-5 text-white"
            >
              <p className="text-sm text-blue-100">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
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
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_180px_180px] xl:items-end">
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

            <form action={applyArchiveF12MappingAction} className="rounded-2xl bg-slate-50 p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_160px_160px] xl:items-end">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">
                    {"6. Применить pilot mapping F12 -> SubmissionValue"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Безопасный пилотный маппинг для `F12`: берет уже загруженные
                    `ImportFieldValue`, сопоставляет их с полями архивной структуры по
                    разделу/коду строки/графе и переносит только уверенные совпадения в
                    региональные `SubmissionValue`.
                  </p>
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
              Таблица показывает, сколько документов найдено в handoff, сколько уже попало в
              локальный registry и есть ли годовая версия формы в приложении.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Файлов в batch: {batch?.files.length ?? 0}, subject-level в registry:{" "}
            {importedSubjectFiles}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-200">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                {["Год", "Форма", "Документов handoff", "В registry", "Версий в приложении"].map(
                  (label) => (
                    <th
                      key={label}
                      className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700"
                    >
                      {label}
                    </th>
                  ),
                )}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

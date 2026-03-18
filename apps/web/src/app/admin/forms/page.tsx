import Link from "next/link";

import {
  createFormAssignmentAction,
  createFormAssignmentForAllRegionsAction,
  createFormTypeAction,
  createFormTemplateAction,
  createFormVersionAction,
  importLegacyFormVersionAction,
  createOperatorFormAssignmentAction,
  createOperatorFormAssignmentsForAllAction,
  duplicateFormVersionAction,
} from "@/app/admin/actions";
import {
  FormAssignmentStatus,
  FormTemplateVersionStatus,
  OrganizationType,
  RoleType,
} from "@/generated/prisma/client";
import { getAdminScope, hasRole, requireAdminUser } from "@/lib/access";
import {
  getLegacyFolderSummary,
  legacyFormCodes,
} from "@/lib/form-builder/legacy-import";
import { prisma } from "@/lib/prisma";

function formatAssignmentStatus(status: FormAssignmentStatus) {
  switch (status) {
    case FormAssignmentStatus.DRAFT:
      return "Черновик";
    case FormAssignmentStatus.PUBLISHED:
      return "Назначено";
    case FormAssignmentStatus.ARCHIVED:
      return "В архиве";
    default:
      return status;
  }
}

function formatVersionStatus(status: FormTemplateVersionStatus) {
  switch (status) {
    case FormTemplateVersionStatus.DRAFT:
      return "Черновик";
    case FormTemplateVersionStatus.PUBLISHED:
      return "Опубликована";
    case FormTemplateVersionStatus.ARCHIVED:
      return "В архиве";
    default:
      return status;
  }
}

export default async function AdminFormsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await requireAdminUser();
  const scope = getAdminScope(currentUser);
  const isSuperadmin = hasRole(currentUser, [RoleType.SUPERADMIN]);

  const regionFilter = scope.isSuperadmin
    ? {
        code: {
          not: "RUSSIAN_FEDERATION",
        },
      }
    : {
        id: {
          in: scope.manageableRegionIds ?? [],
        },
      };

  const [
    formTypes,
    reportingYears,
    templates,
    templateVersions,
    regions,
    assignments,
    operators,
    legacySummaries,
    resolvedSearchParams,
  ] = await Promise.all([
    prisma.formType.findMany({
      orderBy: { code: "asc" },
    }),
    prisma.reportingYear.findMany({
      orderBy: { year: "desc" },
    }),
    prisma.formTemplate.findMany({
      include: {
        formType: true,
        versions: {
          include: {
            reportingYear: true,
          },
          orderBy: [{ reportingYear: { year: "desc" } }, { version: "desc" }],
        },
      },
      orderBy: [{ formType: { code: "asc" } }, { name: "asc" }],
    }),
    prisma.formTemplateVersion.findMany({
      include: {
        template: {
          include: {
            formType: true,
          },
        },
        reportingYear: true,
        fields: true,
      },
      orderBy: [{ reportingYear: { year: "desc" } }, { title: "asc" }],
    }),
    prisma.region.findMany({
      where: regionFilter,
      orderBy: { fullName: "asc" },
    }),
    prisma.formAssignment.findMany({
      where: {
        region: regionFilter,
      },
      include: {
        templateVersion: {
          include: {
            template: {
              include: {
                formType: true,
              },
            },
            reportingYear: true,
          },
        },
        region: true,
        organization: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.user.findMany({
      where: {
        memberships: {
          some: {
            role: RoleType.OPERATOR,
            organization: {
              region: regionFilter,
            },
          },
        },
      },
      include: {
        memberships: {
          where: {
            role: RoleType.OPERATOR,
          },
          include: {
            organization: {
              include: {
                region: true,
              },
            },
          },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    Promise.all(legacyFormCodes.map((code) => getLegacyFolderSummary(code))),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);

  const params = resolvedSearchParams;
  const createdRaw =
    typeof params.created === "string" ? decodeURIComponent(params.created) : null;
  const created = createdRaw ? createdRaw.split("|") : null;
  const templateCreated =
    typeof params.templateCreated === "string"
      ? decodeURIComponent(params.templateCreated)
      : null;
  const formTypeCreatedRaw =
    typeof params.formTypeCreated === "string"
      ? decodeURIComponent(params.formTypeCreated)
      : null;
  const formTypeCreated = formTypeCreatedRaw ? formTypeCreatedRaw.split("|") : null;
  const bulkCreatedRaw =
    typeof params.bulkCreated === "string"
      ? decodeURIComponent(params.bulkCreated)
      : null;
  const bulkCreated = bulkCreatedRaw ? bulkCreatedRaw.split("|") : null;
  const operatorCreatedRaw =
    typeof params.operatorCreated === "string"
      ? decodeURIComponent(params.operatorCreated)
      : null;
  const operatorCreated = operatorCreatedRaw ? operatorCreatedRaw.split("|") : null;
  const error =
    typeof params.error === "string" ? decodeURIComponent(params.error) : null;

  const publishedVersions = templateVersions.filter(
    (version) => version.versionStatus === FormTemplateVersionStatus.PUBLISHED,
  );
  const regionIncomingAssignments = assignments.filter(
    (assignment) => assignment.organization.type === OrganizationType.REGION_CENTER,
  );
  const operatorAssignments = assignments.filter(
    (assignment) => assignment.organization.type === OrganizationType.MEDICAL_FACILITY,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">Каталог форм</h2>
        <p className="mt-3 max-w-3xl text-slate-600">
          Суперадмин управляет шаблонами и версиями форм по годам. Для каждой
          версии можно открыть table-first редактор, сохранить черновик и после
          публикации направить форму вниз по оргструктуре.
        </p>

        {templateCreated ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Шаблон `{templateCreated}` успешно создан.
          </p>
        ) : null}

        {formTypeCreated ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Тип формы `{formTypeCreated[0]}` — `{formTypeCreated[1]}` успешно создан.
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {isSuperadmin ? (
          <div className="mt-8 space-y-6">
            <div className="grid gap-4 xl:grid-cols-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Шаг 1</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Тип формы</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Если появилась новая форма с новым кодом, сначала создайте новый тип.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Шаг 2</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Шаблон</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Для каждого типа можно завести один или несколько шаблонов.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Шаг 3</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Версия на год</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Создайте draft-версию на новый отчетный год и откройте preview.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Шаг 4</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Импорт из `.doc`</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Используйте как черновой старт, если форма уже есть в архиве.
                </p>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <form
                action={createFormTypeAction}
                className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6"
              >
                <div className="space-y-2">
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                    Новый тип формы
                  </p>
                  <label className="text-sm font-medium text-slate-700" htmlFor="newFormTypeCode">
                    Код формы
                  </label>
                  <input
                    id="newFormTypeCode"
                    name="code"
                    placeholder="Например, F61"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="newFormTypeName">
                    Название формы
                  </label>
                  <input
                    id="newFormTypeName"
                    name="name"
                    placeholder="Форма F61"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="newFormTypeDescription"
                  >
                    Описание
                  </label>
                  <textarea
                    id="newFormTypeDescription"
                    name="description"
                    rows={3}
                    placeholder="Что это за форма и для чего она нужна"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    className="rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800"
                  >
                    Создать тип формы
                  </button>
                </div>
              </form>

            <form
              action={createFormTemplateAction}
              className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6"
            >
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                  Новый шаблон
                </p>
                <label className="text-sm font-medium text-slate-700" htmlFor="formTypeId">
                  Тип формы
                </label>
                <select
                  id="formTypeId"
                  name="formTypeId"
                  defaultValue={formTypes[0]?.id}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                >
                  {formTypes.map((formType) => (
                    <option key={formType.id} value={formType.id}>
                      {formType.code} — {formType.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="templateName">
                  Название шаблона
                </label>
                <input
                  id="templateName"
                  name="name"
                  placeholder="Форма F12 — хирургический профиль"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="templateDescription">
                  Описание
                </label>
                <textarea
                  id="templateDescription"
                  name="description"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                  placeholder="Краткое описание назначения шаблона"
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800"
                >
                  Создать шаблон
                </button>
              </div>
            </form>

            <form
              action={createFormVersionAction}
              className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6"
            >
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                  Новая версия
                </p>
                <label className="text-sm font-medium text-slate-700" htmlFor="templateId">
                  Шаблон
                </label>
                <select
                  id="templateId"
                  name="templateId"
                  defaultValue={templates[0]?.id}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.formType.code} — {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="reportingYearId">
                  Отчетный год
                </label>
                <select
                  id="reportingYearId"
                  name="reportingYearId"
                  defaultValue={reportingYears[0]?.id}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                >
                  {reportingYears.map((reportingYear) => (
                    <option key={reportingYear.id} value={reportingYear.id}>
                      {reportingYear.year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="versionTitle">
                  Название версии
                </label>
                <input
                  id="versionTitle"
                  name="title"
                  placeholder="Форма F12 за 2026"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
                >
                  Создать draft-версию
                </button>
              </div>
            </form>
            </div>

            <form
              action={importLegacyFormVersionAction}
              className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6"
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                    Импорт структуры из архива 2024
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">
                    Реальные формы {legacyFormCodes.map((code) => `\`${code}\``).join(", ")}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    Создает черновую draft-версию из реальных `.doc` файлов в локальной
                    папке `forms/`. Это bootstrap-инструмент для старта структуры:
                    после импорта откройте preview, проверьте строки, графы и служебные
                    колонки, затем сохраните и публикуйте.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-5">
                {legacySummaries.map((summary) => (
                  <div
                    key={summary.formCode}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm"
                  >
                    <p className="font-semibold text-slate-950">{summary.formCode}</p>
                    <p className="mt-2 text-slate-600">Файлов в архиве: {summary.fileCount}</p>
                    <p className="mt-1 text-slate-600">Таблиц в sample: {summary.tableCount}</p>
                    <p className="mt-1 text-slate-600">Строк в sample: {summary.totalRows}</p>
                    <p className="mt-2 break-all text-xs text-slate-500">
                      Выбранный sample: {summary.sampleFileName ?? "нет"}
                    </p>
                    {summary.fallbackUsed ? (
                      <p className="mt-2 text-xs font-medium text-amber-700">
                        Сейчас sample распознается с fallback, нужен ручной контроль.
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="legacyImportFormTypeId"
                  >
                    Тип формы
                  </label>
                  <select
                    id="legacyImportFormTypeId"
                    name="formTypeId"
                    defaultValue={
                      formTypes.find((type) => legacyFormCodes.includes(type.code as (typeof legacyFormCodes)[number]))
                        ?.id
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    {formTypes
                      .filter((type) =>
                        legacyFormCodes.includes(type.code as (typeof legacyFormCodes)[number]),
                      )
                      .map((formType) => (
                        <option key={formType.id} value={formType.id}>
                          {formType.code} — {formType.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="legacyImportReportingYearId"
                  >
                    Отчетный год
                  </label>
                  <select
                    id="legacyImportReportingYearId"
                    name="reportingYearId"
                    defaultValue={reportingYears.find((year) => year.year === 2024)?.id ?? reportingYears[0]?.id}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    {reportingYears.map((reportingYear) => (
                      <option key={reportingYear.id} value={reportingYear.id}>
                        {reportingYear.year}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="legacyImportTitle"
                  >
                    Название версии
                  </label>
                  <input
                    id="legacyImportTitle"
                    name="title"
                    defaultValue="Архивная структура 2024"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800"
                >
                  Создать черновик из `.doc`
                </button>
              </div>
            </form>
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Создание и публикация шаблонов доступны суперадмину. Ниже вы видите
            версии форм и назначенные вам публикации.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">Шаблоны и версии</h2>
        <div className="mt-6 space-y-6">
          {templates.map((template) => (
            <article
              key={template.id}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-6"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                    {template.formType.code}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">
                    {template.name}
                  </h3>
                  <p className="mt-2 text-slate-600">
                    {template.description || "Без описания"}
                  </p>
                </div>

                {isSuperadmin && template.versions.length > 0 ? (
                  <form
                    action={duplicateFormVersionAction}
                    className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:min-w-[320px]"
                  >
                    <input
                      type="hidden"
                      name="sourceVersionId"
                      value={template.versions[0]?.id}
                    />
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium text-slate-700"
                        htmlFor={`duplicate-year-${template.id}`}
                      >
                        Скопировать последнюю версию в год
                      </label>
                      <select
                        id={`duplicate-year-${template.id}`}
                        name="reportingYearId"
                        defaultValue={reportingYears[0]?.id}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                      >
                        {reportingYears.map((reportingYear) => (
                          <option key={reportingYear.id} value={reportingYear.id}>
                            {reportingYear.year}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      name="title"
                      defaultValue={`${template.name} — новая версия`}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                    />
                    <button
                      type="submit"
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      Дублировать в новый draft
                    </button>
                  </form>
                ) : null}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {template.versions.map((version) => (
                  <article
                    key={version.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">{version.title}</p>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          version.versionStatus === FormTemplateVersionStatus.PUBLISHED
                            ? "bg-emerald-50 text-emerald-700"
                            : version.versionStatus === FormTemplateVersionStatus.ARCHIVED
                              ? "bg-slate-100 text-slate-500"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {formatVersionStatus(version.versionStatus)}
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-slate-600">
                      Год: {version.reportingYear.year}
                    </p>
                    <p className="text-sm text-slate-600">Версия: v{version.version}</p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link
                        href={`/admin/forms/builder/${version.id}`}
                        className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        Открыть редактор
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">Назначения форм</h2>
        <p className="mt-3 max-w-3xl text-slate-600">
          После публикации версия формы может быть направлена региональным
          администраторам, а затем распределена операторам.
        </p>

        {created ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Форма `{created[1]}` за `{created[2]}` назначена региону `{created[3]}`.
          </p>
        ) : null}

        {bulkCreated ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {bulkCreated[3] === "regions"
              ? `Форма \`${bulkCreated[1]}\` за \`${bulkCreated[2]}\` назначена ${bulkCreated[0]} регионам.`
              : `Форма \`${bulkCreated[1]}\` за \`${bulkCreated[2]}\` назначена ${bulkCreated[0]} операторам.`}
          </p>
        ) : null}

        {operatorCreated ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Форма `{operatorCreated[0]}` направлена оператору организации
            `{operatorCreated[1]}` в регионе `{operatorCreated[2]}`.
          </p>
        ) : null}

        {isSuperadmin ? (
          <div className="mt-8 grid gap-6 xl:grid-cols-2">
            <form
              action={createFormAssignmentAction}
              className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6"
            >
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                  Точечное назначение
                </p>
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="assignmentTemplateVersionId"
                >
                  Опубликованная версия формы
                </label>
                <select
                  id="assignmentTemplateVersionId"
                  name="templateVersionId"
                  defaultValue={publishedVersions[0]?.id}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                >
                  {publishedVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.template.formType.name} — {version.reportingYear.year} — v
                      {version.version}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="regionId">
                  Регион
                </label>
                <select
                  id="regionId"
                  name="regionId"
                  defaultValue={regions[0]?.id}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                >
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="dueDate">
                  Срок сдачи
                </label>
                <input
                  id="dueDate"
                  name="dueDate"
                  type="date"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
                >
                  Назначить форму региону
                </button>
              </div>
            </form>

            <form
              action={createFormAssignmentForAllRegionsAction}
              className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6"
            >
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                  Массовое назначение
                </p>
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="templateVersionIdAllRegions"
                >
                  Опубликованная версия формы
                </label>
                <select
                  id="templateVersionIdAllRegions"
                  name="templateVersionId"
                  defaultValue={publishedVersions[0]?.id}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                >
                  {publishedVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.template.formType.name} — {version.reportingYear.year} — v
                      {version.version}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="dueDateAllRegions"
                >
                  Срок сдачи
                </label>
                <input
                  id="dueDateAllRegions"
                  name="dueDate"
                  type="date"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                />
              </div>

              <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
                Одна операция назначит выбранную форму всем регионам, которым она
                еще не была направлена.
              </div>

              <div>
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800"
                >
                  Назначить всем регионам
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Вы видите опубликованные формы, которые были назначены вашим
              регионам суперадмином, и можете распределить их операторам.
            </p>

            <div className="grid gap-6 xl:grid-cols-2">
              <form
                action={createOperatorFormAssignmentAction}
                className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6"
              >
                <div className="space-y-2">
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                    Точечное распределение
                  </p>
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="regionAssignmentId"
                  >
                    Входящее назначение региону
                  </label>
                  <select
                    id="regionAssignmentId"
                    name="regionAssignmentId"
                    defaultValue={regionIncomingAssignments[0]?.id}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    {regionIncomingAssignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.templateVersion.template.formType.name} —{" "}
                        {assignment.region.fullName} —{" "}
                        {assignment.templateVersion.reportingYear.year}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="organizationId"
                  >
                    Оператор
                  </label>
                  <select
                    id="organizationId"
                    name="organizationId"
                    defaultValue={operators[0]?.memberships[0]?.organizationId}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    {operators.map((operator) => {
                      const membership = operator.memberships[0];

                      return (
                        <option key={operator.id} value={membership?.organizationId}>
                          {operator.fullName} — {membership?.organization.name}
                          {membership?.organization.region
                            ? ` — ${membership.organization.region.shortName}`
                            : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="operatorDueDate"
                  >
                    Срок сдачи
                  </label>
                  <input
                    id="operatorDueDate"
                    name="dueDate"
                    type="date"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
                  >
                    Назначить форму оператору
                  </button>
                </div>
              </form>

              <form
                action={createOperatorFormAssignmentsForAllAction}
                className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6"
              >
                <div className="space-y-2">
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                    Массовое распределение
                  </p>
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="regionAssignmentIdAllOperators"
                  >
                    Входящее назначение региону
                  </label>
                  <select
                    id="regionAssignmentIdAllOperators"
                    name="regionAssignmentId"
                    defaultValue={regionIncomingAssignments[0]?.id}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  >
                    {regionIncomingAssignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.templateVersion.template.formType.name} —{" "}
                        {assignment.region.fullName} —{" "}
                        {assignment.templateVersion.reportingYear.year}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-slate-700"
                    htmlFor="operatorBulkDueDate"
                  >
                    Срок сдачи
                  </label>
                  <input
                    id="operatorBulkDueDate"
                    name="dueDate"
                    type="date"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  />
                </div>

                <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
                  Одна операция распределит выбранную форму всем операторам
                  региона, которым она еще не назначена.
                </div>

                <div>
                  <button
                    type="submit"
                    className="rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800"
                  >
                    Назначить всем операторам
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">Назначенные формы</h2>
        <p className="mt-2 text-slate-600">
          Входящие назначения регионам: {regionIncomingAssignments.length}. Назначения операторам: {operatorAssignments.length}.
        </p>

        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600">Форма</th>
                <th className="px-4 py-3 font-medium text-slate-600">Год</th>
                <th className="px-4 py-3 font-medium text-slate-600">Регион</th>
                <th className="px-4 py-3 font-medium text-slate-600">Получатель</th>
                <th className="px-4 py-3 font-medium text-slate-600">Срок</th>
                <th className="px-4 py-3 font-medium text-slate-600">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-950">
                      {assignment.templateVersion.template.formType.name}
                    </p>
                    <p className="mt-1 text-slate-500">{assignment.templateVersion.title}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {assignment.reportingYearId
                      ? assignment.templateVersion.reportingYear.year
                      : "-"}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {assignment.region.fullName}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {assignment.organization.name}
                    <p className="mt-1 text-xs text-slate-500">
                      {assignment.organization.type === OrganizationType.REGION_CENTER
                        ? "Региональный центр"
                        : "Организация оператора"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {assignment.dueDate
                      ? assignment.dueDate.toLocaleDateString("ru-RU")
                      : "Не указан"}
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
                      {formatAssignmentStatus(assignment.status)}
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

import Link from "next/link";

import {
  createFormAssignmentAction,
  createFormAssignmentForAllRegionsAction,
  createFormTypeAction,
  createFormTemplateAction,
  createFormVersionAction,
  createOperatorFormAssignmentAction,
  createOperatorFormAssignmentsForAllAction,
  deleteFormVersionAction,
  duplicateFormVersionAction,
} from "@/app/admin/actions";
import {
  FormAssignmentStatus,
  FormTemplateVersionStatus,
  OrganizationType,
  RoleType,
  SubmissionStatus,
} from "@/generated/prisma/client";
import { getAdminScope, hasRole, requireAdminUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getScopedSubjectRegionFilter } from "@/lib/regions";

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

function formatSubmissionStatus(status: SubmissionStatus | null) {
  switch (status) {
    case SubmissionStatus.DRAFT:
      return "В работе";
    case SubmissionStatus.SUBMITTED:
      return "Отправлено";
    case SubmissionStatus.IN_REVIEW:
      return "На проверке";
    case SubmissionStatus.CHANGES_REQUESTED:
      return "Нужны правки";
    case SubmissionStatus.APPROVED_BY_REGION:
      return "Принято регионом";
    case SubmissionStatus.APPROVED_BY_SUPERADMIN:
      return "Принято";
    case SubmissionStatus.REJECTED:
      return "Отклонено";
    default:
      return "Не начато";
  }
}

function getVersionStatusClasses(status: FormTemplateVersionStatus) {
  switch (status) {
    case FormTemplateVersionStatus.PUBLISHED:
      return "bg-emerald-50 text-emerald-700";
    case FormTemplateVersionStatus.ARCHIVED:
      return "bg-slate-100 text-slate-500";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

function getRouteStatusClasses(status: SubmissionStatus | null) {
  switch (status) {
    case SubmissionStatus.APPROVED_BY_REGION:
    case SubmissionStatus.APPROVED_BY_SUPERADMIN:
      return "bg-emerald-50 text-emerald-700";
    case SubmissionStatus.SUBMITTED:
    case SubmissionStatus.IN_REVIEW:
      return "bg-blue-50 text-blue-700";
    case SubmissionStatus.CHANGES_REQUESTED:
      return "bg-amber-50 text-amber-700";
    case SubmissionStatus.REJECTED:
      return "bg-rose-50 text-rose-700";
    case SubmissionStatus.DRAFT:
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

type RouteGroupKey = "assigned" | "working" | "review" | "accepted";

function getRouteGroupKey(
  status: SubmissionStatus | null,
  isSuperadmin: boolean,
): RouteGroupKey {
  switch (status) {
    case SubmissionStatus.DRAFT:
      return "working";
    case SubmissionStatus.SUBMITTED:
    case SubmissionStatus.IN_REVIEW:
    case SubmissionStatus.CHANGES_REQUESTED:
    case SubmissionStatus.REJECTED:
      return "review";
    case SubmissionStatus.APPROVED_BY_REGION:
      return isSuperadmin ? "review" : "accepted";
    case SubmissionStatus.APPROVED_BY_SUPERADMIN:
      return "accepted";
    default:
      return "assigned";
  }
}

function getRouteGroupMeta(group: RouteGroupKey) {
  switch (group) {
    case "working":
      return {
        title: "В работе",
        description: "Маршруты с начатым, но еще не отправленным заполнением.",
      };
    case "review":
      return {
        title: "На проверке",
        description: "Отправленные формы и сценарии, требующие реакции.",
      };
    case "accepted":
      return {
        title: "Принято",
        description: "Маршруты, завершившие согласование на текущем уровне.",
      };
    case "assigned":
    default:
      return {
        title: "Назначено",
        description: "Новые и еще не завершенные маршруты по регионам и операторам.",
      };
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

  const regionFilter = getScopedSubjectRegionFilter(scope);

  const [
    formTypes,
    reportingYears,
    templates,
    templateVersions,
    regions,
    assignments,
    operators,
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
        submissions: {
          orderBy: {
            updatedAt: "desc",
          },
          take: 1,
        },
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
  const selectedCreateTab =
    typeof params.tab === "string" && ["template", "type", "version"].includes(params.tab)
      ? params.tab
      : "template";
  const selectedRouteTab =
    typeof params.routes === "string" &&
    ["assigned", "working", "review", "accepted"].includes(params.routes)
      ? params.routes
      : "assigned";

  const publishedVersions = templateVersions.filter(
    (version) => version.versionStatus === FormTemplateVersionStatus.PUBLISHED,
  );
  const regionIncomingAssignments = assignments.filter(
    (assignment) => assignment.organization.type === OrganizationType.REGION_CENTER,
  );
  const summaryMetrics = [
    { label: "Типов форм", value: formTypes.length },
    { label: "Шаблонов", value: templates.length },
    { label: "Версий", value: templateVersions.length },
    { label: "Назначений", value: assignments.length },
  ];
  const templatesByFormType = formTypes
    .map((formType) => ({
      formType,
      templates: templates.filter((template) => template.formTypeId === formType.id),
    }))
    .filter((group) => group.templates.length > 0);
  const selectedCatalogTypeCode =
    typeof params.catalog === "string" &&
    templatesByFormType.some((group) => group.formType.code === params.catalog)
      ? params.catalog
      : templatesByFormType[0]?.formType.code;
  const activeCatalogGroup =
    templatesByFormType.find((group) => group.formType.code === selectedCatalogTypeCode) ??
    templatesByFormType[0] ??
    null;
  const availableRouteYears = Array.from(
    new Set(assignments.map((assignment) => assignment.templateVersion.reportingYear.year)),
  ).sort((left, right) => right - left);
  const selectedRouteYear =
    typeof params.routeYear === "string" && !Number.isNaN(Number(params.routeYear))
      ? Number(params.routeYear)
      : availableRouteYears.includes(2026)
        ? 2026
        : availableRouteYears[0] ?? reportingYears[0]?.year ?? 2026;
  const formsPageQuery = `tab=${selectedCreateTab}&catalog=${selectedCatalogTypeCode ?? ""}&routes=${selectedRouteTab}&routeYear=${selectedRouteYear}`;
  const routeItems = assignments.map((assignment) => {
    const submission = assignment.submissions[0] ?? null;
    const routeGroup = getRouteGroupKey(submission?.status ?? null, isSuperadmin);
    const direction =
      assignment.organization.type === OrganizationType.REGION_CENTER
        ? "Федеральный центр -> Регион"
        : "Регион -> Оператор";
    const actionHref =
      assignment.organization.type === OrganizationType.REGION_CENTER
        ? isSuperadmin
          ? submission
            ? `/admin/forms/review/${submission.id}`
            : null
          : `/admin/forms/assignments/${assignment.id}`
        : submission
          ? `/admin/forms/review/${submission.id}`
          : null;
    const actionLabel =
      assignment.organization.type === OrganizationType.REGION_CENTER
        ? isSuperadmin
          ? "Проверить"
          : submission
            ? "Открыть"
            : "Заполнить"
        : "Открыть";

    return {
      assignment,
      submission,
      routeGroup,
      direction,
      actionHref,
      actionLabel,
      statusLabel: submission
        ? formatSubmissionStatus(submission.status)
        : formatAssignmentStatus(assignment.status),
    };
  });
  const filteredRouteItems = routeItems.filter(
    (route) => route.assignment.templateVersion.reportingYear.year === selectedRouteYear,
  );
  const routeGroups: Array<{
    key: RouteGroupKey;
    title: string;
    description: string;
    items: typeof filteredRouteItems;
  }> = (["assigned", "working", "review", "accepted"] as const).map((groupKey) => {
    const meta = getRouteGroupMeta(groupKey);

    return {
      key: groupKey,
      title: meta.title,
      description: meta.description,
      items: filteredRouteItems.filter((route) => route.routeGroup === groupKey),
    };
  });
  const activeRouteGroup =
    routeGroups.find((group) => group.key === selectedRouteTab) ?? routeGroups[0];

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Управление формами
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
              Каталог форм
            </h1>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {isSuperadmin ? "Режим суперадмина" : "Режим регионального администратора"}
          </div>
        </div>

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

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryMetrics.map((metric) => (
            <article
              key={metric.label}
              className="rounded-3xl border border-[#2e78be] bg-[#1f67ab] p-5 text-white"
            >
              <p className="text-sm text-blue-100">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
                {metric.value}
              </p>
            </article>
          ))}
        </div>

        {isSuperadmin ? (
          <div className="mt-8 space-y-6">
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/admin/forms?tab=template&catalog=${selectedCatalogTypeCode ?? ""}&routes=${selectedRouteTab}&routeYear=${selectedRouteYear}`}
                scroll={false}
                className={`rounded-2xl px-5 py-3 text-sm font-medium transition ${
                  selectedCreateTab === "template"
                    ? "bg-[#1f67ab] text-white shadow-[0_12px_24px_rgba(31,103,171,0.18)]"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Новый шаблон
              </Link>
              <Link
                href={`/admin/forms?tab=type&catalog=${selectedCatalogTypeCode ?? ""}&routes=${selectedRouteTab}&routeYear=${selectedRouteYear}`}
                scroll={false}
                className={`rounded-2xl px-5 py-3 text-sm font-medium transition ${
                  selectedCreateTab === "type"
                    ? "bg-[#1f67ab] text-white shadow-[0_12px_24px_rgba(31,103,171,0.18)]"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Новый тип формы
              </Link>
              <Link
                href={`/admin/forms?tab=version&catalog=${selectedCatalogTypeCode ?? ""}&routes=${selectedRouteTab}&routeYear=${selectedRouteYear}`}
                scroll={false}
                className={`rounded-2xl px-5 py-3 text-sm font-medium transition ${
                  selectedCreateTab === "version"
                    ? "bg-[#1f67ab] text-white shadow-[0_12px_24px_rgba(31,103,171,0.18)]"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Новая версия формы
              </Link>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              {selectedCreateTab === "type" ? (
                <form action={createFormTypeAction} className="grid gap-4 lg:max-w-2xl">
                  <div className="space-y-2">
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
              ) : null}

              {selectedCreateTab === "template" ? (
                <form action={createFormTemplateAction} className="grid gap-4 lg:max-w-2xl">
                  <div className="space-y-2">
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
              ) : null}

              {selectedCreateTab === "version" ? (
                <form action={createFormVersionAction} className="grid gap-4 lg:max-w-2xl">
                  <div className="space-y-2">
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
                      className="rounded-2xl bg-[#1f67ab] px-5 py-3 font-medium text-white transition hover:bg-[#185993]"
                    >
                      Создать draft-версию
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Создание и публикация шаблонов доступны суперадмину. Ниже вы видите
            версии форм и назначенные вам публикации.
          </p>
        )}
      </section>

      <section
        id="templates-catalog"
        className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Шаблоны и версии</h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              Каталог сгруппирован по типам форм. Внутри каждого типа показаны шаблоны и компактный список версий по годам.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Типов с шаблонами: {templatesByFormType.length}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {templatesByFormType.map(({ formType }) => (
            <Link
              key={formType.id}
              href={`/admin/forms?tab=${selectedCreateTab}&catalog=${formType.code}&routes=${selectedRouteTab}&routeYear=${selectedRouteYear}`}
              scroll={false}
              className={`rounded-2xl px-5 py-3 text-sm font-medium transition ${
                selectedCatalogTypeCode === formType.code
                  ? "bg-[#1f67ab] text-white shadow-[0_12px_24px_rgba(31,103,171,0.18)]"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {formType.code}
            </Link>
          ))}
        </div>

        {activeCatalogGroup ? (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1f67ab]">
                  {activeCatalogGroup.formType.code}
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                  {activeCatalogGroup.formType.name}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Шаблонов в группе: {activeCatalogGroup.templates.length}
                </p>
              </div>
              {activeCatalogGroup.formType.description ? (
                <p className="max-w-2xl text-sm leading-6 text-slate-500">
                  {activeCatalogGroup.formType.description}
                </p>
              ) : null}
            </div>

            <div className="mt-6 space-y-4">
              {activeCatalogGroup.templates.map((template) => (
                <article
                  key={template.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <h4 className="text-lg font-semibold text-slate-950">{template.name}</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {template.description || "Без описания"}
                      </p>
                    </div>

                    {isSuperadmin && template.versions.length > 0 ? (
                      <form
                        action={duplicateFormVersionAction}
                        className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:min-w-[720px]"
                      >
                        <input
                          type="hidden"
                          name="sourceVersionId"
                          value={template.versions[0]?.id}
                        />
                        <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Быстрый дубль версии
                        </p>
                        <select
                          id={`duplicate-year-${template.id}`}
                          name="reportingYearId"
                          defaultValue={reportingYears[0]?.id}
                          className="min-w-[120px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                        >
                          {reportingYears.map((reportingYear) => (
                            <option key={reportingYear.id} value={reportingYear.id}>
                              {reportingYear.year}
                            </option>
                          ))}
                        </select>
                        <input
                          name="title"
                          defaultValue={`${template.name} — новая версия`}
                          className="min-w-[260px] flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                        />
                        <button
                          type="submit"
                          className="shrink-0 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-white"
                        >
                          Дублировать в draft
                        </button>
                      </form>
                    ) : null}
                  </div>

                  <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                    <div className="grid grid-cols-[110px_90px_minmax(0,1fr)_170px_220px] gap-0 bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      <div className="px-4 py-3">Год</div>
                      <div className="px-4 py-3">Версия</div>
                      <div className="px-4 py-3">Название</div>
                      <div className="px-4 py-3">Статус</div>
                      <div className="px-4 py-3">Действие</div>
                    </div>
                    <div className="divide-y divide-slate-200 bg-white">
                      {template.versions.map((version) => (
                        <div
                          key={version.id}
                          className="grid items-center grid-cols-[110px_90px_minmax(0,1fr)_170px_220px] gap-0"
                        >
                          <div className="px-4 py-3 text-sm text-slate-700">
                            {version.reportingYear.year}
                          </div>
                          <div className="px-4 py-3 text-sm font-medium text-slate-900">
                            v{version.version}
                          </div>
                          <div className="min-w-0 px-4 py-3 text-sm text-slate-700">
                            <p className="truncate font-medium text-slate-950">{version.title}</p>
                          </div>
                          <div className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getVersionStatusClasses(version.versionStatus)}`}
                            >
                              {formatVersionStatus(version.versionStatus)}
                            </span>
                          </div>
                          <div className="px-4 py-3">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <Link
                                href={`/admin/forms/builder/${version.id}`}
                                className="inline-flex rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                              >
                                Открыть
                              </Link>
                              {isSuperadmin ? (
                                <form action={deleteFormVersionAction}>
                                  <input type="hidden" name="versionId" value={version.id} />
                                  <input
                                    type="hidden"
                                    name="returnTo"
                                    value={`/admin/forms?${formsPageQuery}#templates-catalog`}
                                  />
                                  <button
                                    type="submit"
                                    className="inline-flex rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                                  >
                                    Удалить
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
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
                  className="rounded-2xl bg-[#1f67ab] px-5 py-3 font-medium text-white transition hover:bg-[#185993]"
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Маршруты форм</h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              Здесь собраны маршруты по регионам и операторам. Структура уже готова к будущим принятым и завершенным сценариям.
            </p>
          </div>
          <form className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <input type="hidden" name="tab" value={selectedCreateTab} />
            <input type="hidden" name="catalog" value={selectedCatalogTypeCode ?? ""} />
            <input type="hidden" name="routes" value={selectedRouteTab} />
            <label className="text-sm font-medium text-slate-600" htmlFor="routeYear">
              Год
            </label>
            <select
              id="routeYear"
              name="routeYear"
              defaultValue={String(selectedRouteYear)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900"
            >
              {availableRouteYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-2xl bg-[#1f67ab] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#185993]"
            >
              Показать
            </button>
          </form>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {routeGroups.map((group) => (
            <Link
              key={group.key}
              href={`/admin/forms?tab=${selectedCreateTab}&catalog=${selectedCatalogTypeCode ?? ""}&routes=${group.key}&routeYear=${selectedRouteYear}`}
              scroll={false}
              className={`rounded-2xl px-5 py-3 text-sm font-medium transition ${
                selectedRouteTab === group.key
                  ? "bg-[#1f67ab] text-white shadow-[0_12px_24px_rgba(31,103,171,0.18)]"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {group.title}
            </Link>
          ))}
        </div>

        <div className="mt-8">
          {activeRouteGroup ? (
            <section
              key={activeRouteGroup.key}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{activeRouteGroup.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{activeRouteGroup.description}</p>
                </div>
                <span className="inline-flex rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700">
                  {activeRouteGroup.items.length}
                </span>
              </div>

              {activeRouteGroup.items.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                  В этой группе пока нет маршрутов.
                </div>
              ) : (
                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-[90px_minmax(0,1.5fr)_160px_170px_170px_130px_140px_120px] gap-0 bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <div className="px-4 py-3">Форма</div>
                    <div className="px-4 py-3">Название</div>
                    <div className="px-4 py-3">Регион</div>
                    <div className="px-4 py-3">Получатель</div>
                    <div className="px-4 py-3">Маршрут</div>
                    <div className="px-4 py-3">Срок</div>
                    <div className="px-4 py-3">Статус</div>
                    <div className="px-4 py-3">Действие</div>
                  </div>
                  <div className="divide-y divide-slate-200">
                  {activeRouteGroup.items.map(
                    ({ assignment, submission, direction, statusLabel, actionHref, actionLabel }) => (
                    <div
                      key={assignment.id}
                      className="grid items-center grid-cols-[90px_minmax(0,1.5fr)_160px_170px_170px_130px_140px_120px] gap-0"
                    >
                      <div className="px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#1f67ab]">
                        {assignment.templateVersion.template.formType.code}
                      </div>
                      <div className="min-w-0 px-4 py-3 text-sm text-slate-700">
                        <p className="truncate font-medium text-slate-950">
                          {assignment.templateVersion.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {assignment.templateVersion.reportingYear.year} ·{" "}
                          {formatAssignmentStatus(assignment.status)}
                        </p>
                      </div>
                      <div className="truncate px-4 py-3 text-sm text-slate-700">
                        {assignment.region.fullName}
                      </div>
                      <div className="truncate px-4 py-3 text-sm text-slate-700">
                        {assignment.organization.name}
                      </div>
                      <div className="truncate px-4 py-3 text-sm text-slate-600">{direction}</div>
                      <div className="px-4 py-3 text-sm text-slate-600">
                        {assignment.dueDate
                          ? assignment.dueDate.toLocaleDateString("ru-RU")
                          : "Не указан"}
                      </div>
                      <div className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getRouteStatusClasses(submission?.status ?? null)}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="px-4 py-3">
                        {actionHref ? (
                          <Link
                            href={actionHref}
                            className="inline-flex rounded-2xl bg-[#1f67ab] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#185993]"
                          >
                            {actionLabel}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">Нет отправки</span>
                        )}
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

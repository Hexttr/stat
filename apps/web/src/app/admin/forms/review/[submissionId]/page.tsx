import Link from "next/link";
import { notFound } from "next/navigation";

import {
  reviewSubmissionAction,
  saveArchiveStructureOverridesAction,
  saveReviewedSubmissionValuesAction,
} from "@/app/admin/actions";
import { ReviewEditableSubmissionForm } from "@/app/admin/forms/review/review-editable-submission-form";
import {
  ArchiveStructureOverrideTargetType,
  OrganizationType,
  RoleType,
  SubmissionStatus,
} from "@/generated/prisma/client";
import { getAdminScope, hasRole, requireAdminUser } from "@/lib/access";
import { formBuilderSchema } from "@/lib/form-builder/schema";
import { RuntimeValueMap } from "@/lib/form-builder/runtime";
import { prisma } from "@/lib/prisma";

function getInitialSubmissionValues(params: {
  fields: Array<{
    id: string;
    key: string;
    fieldType: string;
  }>;
  values: Array<{
    fieldId: string;
    valueText: string | null;
    valueNumber: unknown;
    valueBoolean: boolean | null;
  }>;
}) {
  const valueByFieldId = new Map(params.values.map((value) => [value.fieldId, value]));

  return Object.fromEntries(
    params.fields.map((field) => {
      const existingValue = valueByFieldId.get(field.id);

      if (!existingValue) {
        return [field.key, field.fieldType === "checkbox" ? false : ""];
      }

      if (field.fieldType === "number") {
        return [field.key, existingValue.valueNumber ? String(existingValue.valueNumber) : ""];
      }

      if (field.fieldType === "checkbox") {
        return [field.key, existingValue.valueBoolean ?? false];
      }

      return [field.key, existingValue.valueText ?? ""];
    }),
  ) satisfies RuntimeValueMap;
}

function parseNotice(value: string | string[] | undefined, expectedLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const decoded = decodeURIComponent(value).split("|");
  return decoded.length >= expectedLength ? decoded : null;
}

function createStructureOverrideKey(params: {
  targetType: ArchiveStructureOverrideTargetType;
  tableId: string;
  rowKey?: string | null;
  columnKey?: string | null;
}) {
  return `${params.targetType}|${params.tableId}|${params.rowKey ?? ""}|${params.columnKey ?? ""}`;
}

function formatSubmissionStatus(status: SubmissionStatus) {
  switch (status) {
    case SubmissionStatus.DRAFT:
      return "Черновик";
    case SubmissionStatus.SUBMITTED:
      return "Отправлено на проверку";
    case SubmissionStatus.IN_REVIEW:
      return "На проверке";
    case SubmissionStatus.CHANGES_REQUESTED:
      return "Требуются правки";
    case SubmissionStatus.APPROVED_BY_REGION:
      return "Принято регионом";
    case SubmissionStatus.APPROVED_BY_SUPERADMIN:
      return "Принято федеральным уровнем";
    case SubmissionStatus.REJECTED:
      return "Отклонено";
    default:
      return status;
  }
}

function getStatusClasses(status: SubmissionStatus) {
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
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getAvailableDecisions(params: {
  isSuperadmin: boolean;
  status: SubmissionStatus;
  organizationType: OrganizationType;
}) {
  type ReviewDecisionButton = {
    decision:
      | "start_review"
      | "request_changes"
      | "approve_region"
      | "approve_superadmin"
      | "reject";
    label: string;
    className: string;
  };
  if (!params.isSuperadmin && params.organizationType !== OrganizationType.MEDICAL_FACILITY) {
    return [];
  }

  if (params.status === SubmissionStatus.APPROVED_BY_SUPERADMIN) {
    return [];
  }

  const decisionSet: ReviewDecisionButton[] = [];

  const canStartReview = params.isSuperadmin
    ? params.organizationType === OrganizationType.REGION_CENTER
      ? params.status === SubmissionStatus.SUBMITTED
      : params.status === SubmissionStatus.APPROVED_BY_REGION
    : params.status === SubmissionStatus.SUBMITTED;

  if (canStartReview) {
    decisionSet.push({
      decision: "start_review",
      label: "Взять в проверку",
      className:
        "rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50",
    });
  }

  if (params.status === SubmissionStatus.IN_REVIEW) {
    decisionSet.push(
      {
        decision: "request_changes",
        label: "Вернуть на доработку",
        className:
          "rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-600",
      },
      {
        decision: "reject",
        label: "Отклонить",
        className:
          "rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-rose-700",
      },
    );
  }

  const canApproveSuperadmin =
    params.isSuperadmin &&
    (params.organizationType === OrganizationType.REGION_CENTER
      ? params.status === SubmissionStatus.SUBMITTED || params.status === SubmissionStatus.IN_REVIEW
      : params.status === SubmissionStatus.APPROVED_BY_REGION ||
          params.status === SubmissionStatus.IN_REVIEW);

  if (canApproveSuperadmin) {
    decisionSet.push({
      decision: "approve_superadmin",
      label: "Принять федерально",
      className:
        "rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700",
    });
  }

  const canApproveRegion =
    !params.isSuperadmin &&
    params.organizationType === OrganizationType.MEDICAL_FACILITY &&
    (params.status === SubmissionStatus.SUBMITTED || params.status === SubmissionStatus.IN_REVIEW);

  if (canApproveRegion) {
    decisionSet.push({
      decision: "approve_region",
      label: "Принять регионом",
      className:
        "rounded-2xl bg-[#1f67ab] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#185993]",
    });
  }

  return decisionSet;
}

function getWorkflowLabel(organizationType: OrganizationType) {
  return organizationType === OrganizationType.REGION_CENTER
    ? "Федеральный центр -> Регион -> Федеральное принятие"
    : "Оператор -> Регион -> Федеральное принятие";
}

function getNextStepLabel(params: {
  status: SubmissionStatus;
  organizationType: OrganizationType;
  isSuperadmin: boolean;
}) {
  if (params.status === SubmissionStatus.APPROVED_BY_SUPERADMIN) {
    return "форма уже финально принята";
  }

  if (params.organizationType === OrganizationType.REGION_CENTER) {
    switch (params.status) {
      case SubmissionStatus.SUBMITTED:
        return params.isSuperadmin
          ? "взять форму в федеральную проверку или принять федерально"
          : "ожидать федеральную проверку";
      case SubmissionStatus.IN_REVIEW:
        return params.isSuperadmin
          ? "завершить федеральную проверку"
          : "ожидать решения федерального уровня";
      case SubmissionStatus.CHANGES_REQUESTED:
        return params.isSuperadmin
          ? "ожидать исправления региона"
          : "исправить форму и отправить заново";
      case SubmissionStatus.REJECTED:
        return params.isSuperadmin
          ? "дождаться нового решения по маршруту"
          : "решить, будет ли форма отправлена заново";
      default:
        return "следовать маршруту согласования";
    }
  }

  switch (params.status) {
    case SubmissionStatus.SUBMITTED:
      return params.isSuperadmin
        ? "ожидать регионального принятия"
        : "взять форму в региональную проверку";
    case SubmissionStatus.IN_REVIEW:
      return params.isSuperadmin
        ? "завершить федеральную проверку"
        : "принять форму регионом или вернуть на доработку";
    case SubmissionStatus.CHANGES_REQUESTED:
      return params.isSuperadmin
        ? "ожидать повторного принятия регионом"
        : "дождаться исправлений оператора";
    case SubmissionStatus.APPROVED_BY_REGION:
      return params.isSuperadmin
        ? "выполнить федеральное принятие"
        : "ожидать решения федерального уровня";
    case SubmissionStatus.REJECTED:
      return params.isSuperadmin
        ? "дождаться нового движения по маршруту"
        : "дождаться повторной отправки или закрытия вопроса";
    default:
      return "следовать маршруту согласования";
  }
}

export default async function AdminSubmissionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await requireAdminUser();
  const scope = getAdminScope(currentUser);
  const isSuperadmin = hasRole(currentUser, [RoleType.SUPERADMIN]);
  const { submissionId } = await params;

  const [submission, resolvedSearchParams] = await Promise.all([
    prisma.submission.findFirst({
      where: {
        id: submissionId,
        assignment: scope.isSuperadmin
          ? undefined
          : {
              regionId: {
                in: scope.manageableRegionIds ?? [],
              },
            },
      },
      include: {
        values: true,
        submittedBy: true,
        reviewedBy: true,
        assignment: {
          include: {
            region: true,
            organization: true,
            templateVersion: {
              include: {
                template: {
                  include: {
                    formType: true,
                  },
                },
                reportingYear: true,
                fields: true,
              },
            },
          },
        },
      },
    }),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);

  if (!submission) {
    notFound();
  }

  const schema = formBuilderSchema.parse(submission.assignment.templateVersion.schemaJson);
  const structureOverrides = await prisma.archiveStructureOverride.findMany({
    where: {
      formTypeId: submission.assignment.templateVersion.template.formType.id,
      reportingYearId: submission.assignment.templateVersion.reportingYear.id,
    },
    orderBy: [
      { tableId: "asc" },
      { targetType: "asc" },
      { rowKey: "asc" },
      { columnKey: "asc" },
    ],
  });
  const structureOverrideByKey = new Map(
    structureOverrides.map((override) => [
      createStructureOverrideKey({
        targetType: override.targetType,
        tableId: override.tableId,
        rowKey: override.rowKey,
        columnKey: override.columnKey,
      }),
      override,
    ]),
  );
  const structureEntries = schema.tables.flatMap((table) => {
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

    const tableOverride = structureOverrideByKey.get(
      createStructureOverrideKey({
        targetType: ArchiveStructureOverrideTargetType.TABLE_TITLE,
        tableId: table.id,
      }),
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
      const rowOverride = structureOverrideByKey.get(
        createStructureOverrideKey({
          targetType: ArchiveStructureOverrideTargetType.ROW_LABEL,
          tableId: table.id,
          rowKey: row.key,
        }),
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

    for (const column of table.descriptorColumns) {
      const columnOverride = structureOverrideByKey.get(
        createStructureOverrideKey({
          targetType: ArchiveStructureOverrideTargetType.COLUMN_LABEL,
          tableId: table.id,
          columnKey: column.key,
        }),
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

    for (const column of table.columns) {
      const columnOverride = structureOverrideByKey.get(
        createStructureOverrideKey({
          targetType: ArchiveStructureOverrideTargetType.COLUMN_LABEL,
          tableId: table.id,
          columnKey: column.key,
        }),
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
  });
  const values = getInitialSubmissionValues({
    fields: submission.assignment.templateVersion.fields,
    values: submission.values,
  });
  const saved = resolvedSearchParams.saved === "1";
  const updated = resolvedSearchParams.updated === "1";
  const structureSaved = parseNotice(resolvedSearchParams.structureSaved, 3);
  const error =
    typeof resolvedSearchParams.error === "string"
      ? decodeURIComponent(resolvedSearchParams.error)
      : null;
  const decisions = getAvailableDecisions({
    isSuperadmin,
    status: submission.status,
    organizationType: submission.assignment.organization.type,
  });
  const reviewLayerTitle = isSuperadmin
    ? "Федеральная проверка"
    : "Проверка региональным администратором";
  const routeLabel =
    getWorkflowLabel(submission.assignment.organization.type);
  const nextStepLabel = getNextStepLabel({
    status: submission.status,
    organizationType: submission.assignment.organization.type,
    isSuperadmin,
  });
  const canEditStructure = isSuperadmin;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              {reviewLayerTitle}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {submission.assignment.templateVersion.title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
              <span>
                {submission.assignment.templateVersion.template.formType.code} /{" "}
                {submission.assignment.templateVersion.reportingYear.year}
              </span>
              <span>{submission.assignment.region.fullName}</span>
              <span>{submission.assignment.organization.name}</span>
              <span>{routeLabel}</span>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-slate-600">
              Следующий шаг по маршруту: {nextStepLabel}.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 xl:items-end">
            <span
              className={`inline-flex rounded-full px-4 py-2 text-sm font-medium ${getStatusClasses(submission.status)}`}
            >
              {formatSubmissionStatus(submission.status)}
            </span>
            <Link
              href="/admin/forms"
              className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Вернуться к маршрутам
            </Link>
          </div>
        </div>

        {updated ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Статус проверки обновлен.
          </p>
        ) : null}
        {saved ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Изменения в значениях формы сохранены.
          </p>
        ) : null}
        {structureSaved ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Подписи структуры сохранены: {structureSaved[0]} / {structureSaved[1]}, элементов:{" "}
            {structureSaved[2]}.
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Отправил
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {submission.submittedBy?.fullName ?? "Не указан"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {submission.submittedAt
                ? submission.submittedAt.toLocaleString("ru-RU")
                : "Дата отправки не зафиксирована"}
            </p>
          </article>
          <article className="rounded-2xl bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Последний reviewer
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {submission.reviewedBy?.fullName ?? "Пока не назначен"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {submission.reviewedAt
                ? submission.reviewedAt.toLocaleString("ru-RU")
                : "Решение еще не принято"}
            </p>
          </article>
          <article className="rounded-2xl bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Комментарий
            </p>
            <p className="mt-2 text-sm text-slate-700">
              {submission.reviewComment ?? "Комментарий пока не оставлен"}
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Решение по форме</h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              Здесь фиксируется текущий этап маршрута и комментарий для предыдущего или следующего
              участника согласования.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          <span className="font-medium text-slate-900">Маршрут:</span> {routeLabel}.{" "}
          <span className="font-medium text-slate-900">Следующий шаг:</span> {nextStepLabel}.
        </div>

        {decisions.length > 0 ? (
          <form action={reviewSubmissionAction} className="mt-6 space-y-4">
            <input type="hidden" name="submissionId" value={submission.id} />
            <input
              type="hidden"
              name="returnTo"
              value={`/admin/forms/review/${submission.id}`}
            />
            <div className="space-y-2">
              <label
                htmlFor="reviewComment"
                className="text-sm font-medium text-slate-700"
              >
                Комментарий проверяющего
              </label>
              <textarea
                id="reviewComment"
                name="reviewComment"
                rows={4}
                defaultValue={submission.reviewComment ?? ""}
                placeholder="Например: уточнить строки 4-7 или подтвердить корректность после сверки."
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1f67ab] focus:ring-4 focus:ring-[#1f67ab]/10"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              {decisions.map((decision) => (
                <button
                  key={decision.decision}
                  type="submit"
                  name="decision"
                  value={decision.decision}
                  className={decision.className}
                >
                  {decision.label}
                </button>
              ))}
            </div>
          </form>
        ) : (
          <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
            Для этой отправки сейчас нет доступных действий на вашем уровне. Форму можно
            просмотреть, но менять ее статус нельзя.
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Проверка формы</h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              На этом экране доступны два режима: правка значений в текущем `Submission` и
              правка структуры для всей формы этого года.
            </p>
          </div>
        </div>
        <ReviewEditableSubmissionForm
          submissionId={submission.id}
          returnTo={`/admin/forms/review/${submission.id}`}
          schema={schema}
          initialValues={values}
          saveAction={saveReviewedSubmissionValuesAction}
          structureEntries={structureEntries}
          structureSaveAction={saveArchiveStructureOverridesAction}
          formTypeId={submission.assignment.templateVersion.template.formType.id}
          reportingYearId={submission.assignment.templateVersion.reportingYear.id}
          canEditStructure={canEditStructure}
          workflowLabel={routeLabel}
          nextStepLabel={nextStepLabel}
          errorMessage={error}
        />
      </section>
    </div>
  );
}

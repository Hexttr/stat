import { notFound } from "next/navigation";

import {
  saveRegionSubmissionDraftAction,
  submitRegionSubmissionAction,
} from "@/app/admin/actions";
import { OperatorAssignmentForm } from "@/app/operator/operator-assignment-form";
import {
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

function formatSubmissionStatus(status: SubmissionStatus | null) {
  switch (status) {
    case SubmissionStatus.DRAFT:
      return "Черновик региона";
    case SubmissionStatus.SUBMITTED:
      return "Отправлено в федеральный центр";
    case SubmissionStatus.IN_REVIEW:
      return "На федеральной проверке";
    case SubmissionStatus.CHANGES_REQUESTED:
      return "Федеральный центр запросил правки";
    case SubmissionStatus.APPROVED_BY_SUPERADMIN:
      return "Принято федеральным уровнем";
    case SubmissionStatus.REJECTED:
      return "Отклонено";
    default:
      return "Новая форма";
  }
}

export default async function AdminRegionAssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await requireAdminUser();
  const scope = getAdminScope(currentUser);
  const isSuperadmin = hasRole(currentUser, [RoleType.SUPERADMIN]);
  const { assignmentId } = await params;

  const [assignment, resolvedSearchParams] = await Promise.all([
    prisma.formAssignment.findFirst({
      where: {
        id: assignmentId,
        organization: {
          type: OrganizationType.REGION_CENTER,
        },
        region: scope.isSuperadmin
          ? {
              code: {
                not: "RUSSIAN_FEDERATION",
              },
            }
          : {
              id: {
                in: scope.manageableRegionIds ?? [],
              },
            },
      },
      include: {
        region: true,
        organization: true,
        reportingYear: true,
        templateVersion: {
          include: {
            template: {
              include: {
                formType: true,
              },
            },
            fields: true,
          },
        },
        submissions: {
          include: {
            values: true,
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 1,
        },
      },
    }),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);

  if (!assignment) {
    notFound();
  }

  const schema = formBuilderSchema.parse(assignment.templateVersion.schemaJson);
  const submission = assignment.submissions[0] ?? null;
  const initialValues = submission
    ? getInitialSubmissionValues({
        fields: assignment.templateVersion.fields,
        values: submission.values,
      })
    : ({} satisfies RuntimeValueMap);
  const saved = resolvedSearchParams.saved === "1";
  const submitted = resolvedSearchParams.submitted === "1";
  const error =
    typeof resolvedSearchParams.error === "string"
      ? decodeURIComponent(resolvedSearchParams.error)
      : null;
  const readOnly =
    isSuperadmin ||
    submission?.status === SubmissionStatus.SUBMITTED ||
    submission?.status === SubmissionStatus.IN_REVIEW ||
    submission?.status === SubmissionStatus.APPROVED_BY_SUPERADMIN;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
              {assignment.templateVersion.template.formType.code} / {assignment.reportingYear.year}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              {assignment.templateVersion.title}
            </h2>
            <p className="mt-3 max-w-3xl text-slate-600">
              Региональный ввод: {assignment.region.fullName}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Статус: {formatSubmissionStatus(submission?.status ?? null)}
          </div>
        </div>

        {saved ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Черновик региона сохранен.
          </p>
        ) : null}

        {submitted ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Региональная форма отправлена в федеральный центр на проверку.
          </p>
        ) : null}

        {submission?.reviewComment ? (
          <p className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Комментарий по архиву или проверке: {submission.reviewComment}
          </p>
        ) : null}
      </section>

      <OperatorAssignmentForm
        assignmentId={assignment.id}
        schema={schema}
        initialValues={initialValues}
        saveAction={saveRegionSubmissionDraftAction}
        submitAction={submitRegionSubmissionAction}
        readOnly={readOnly}
        errorMessage={error}
      />
    </div>
  );
}

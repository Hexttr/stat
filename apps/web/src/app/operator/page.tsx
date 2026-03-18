import Link from "next/link";

import {
  FormAssignmentStatus,
  OrganizationType,
  SubmissionStatus,
} from "@/generated/prisma/client";
import { requireOperatorUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

function formatSubmissionStatus(status: SubmissionStatus | null) {
  switch (status) {
    case SubmissionStatus.DRAFT:
      return "Черновик";
    case SubmissionStatus.SUBMITTED:
      return "Отправлено";
    case SubmissionStatus.IN_REVIEW:
      return "На проверке";
    case SubmissionStatus.CHANGES_REQUESTED:
      return "Нужны правки";
    case SubmissionStatus.APPROVED_BY_REGION:
      return "Принято регионом";
    case SubmissionStatus.APPROVED_BY_SUPERADMIN:
      return "Принято федеральным уровнем";
    case SubmissionStatus.REJECTED:
      return "Отклонено";
    default:
      return "Не начато";
  }
}

export default async function OperatorDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const operatorUser = await requireOperatorUser();
  const operatorOrganizationIds = operatorUser.memberships
    .filter((membership) => membership.role === "OPERATOR")
    .map((membership) => membership.organizationId);

  const [assignments, resolvedSearchParams] = await Promise.all([
    prisma.formAssignment.findMany({
      where: {
        organizationId: {
          in: operatorOrganizationIds,
        },
        organization: {
          type: OrganizationType.MEDICAL_FACILITY,
        },
        status: FormAssignmentStatus.PUBLISHED,
      },
      include: {
        organization: true,
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
        submissions: {
          where: {
            organizationId: {
              in: operatorOrganizationIds,
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: [
        {
          reportingYear: {
            year: "desc",
          },
        },
        {
          createdAt: "desc",
        },
      ],
    }),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);

  const error =
    typeof resolvedSearchParams.error === "string"
      ? decodeURIComponent(resolvedSearchParams.error)
      : null;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">Назначенные формы</h2>
        <p className="mt-3 max-w-3xl text-slate-600">
          Здесь оператор видит все формы, назначенные его организации, может
          продолжить черновик и отправить форму на проверку региональному администратору.
        </p>

        {error ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-200">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700">
                  Форма
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700">
                  Организация
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700">
                  Период
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700">
                  Статус
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700">
                  Действие
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => {
                const submission = assignment.submissions[0] ?? null;

                return (
                  <tr key={assignment.id}>
                    <td className="border-b border-slate-200 px-4 py-4 text-slate-900">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {assignment.templateVersion.template.formType.code} /{" "}
                          {assignment.templateVersion.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {assignment.region.fullName}
                        </p>
                      </div>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-4 text-slate-700">
                      {assignment.organization.name}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-4 text-slate-700">
                      {assignment.reportingYear.year}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-4 text-slate-700">
                      {formatSubmissionStatus(submission?.status ?? null)}
                    </td>
                    <td className="border-b border-slate-200 px-4 py-4">
                      <Link
                        href={`/operator/assignments/${assignment.id}`}
                        className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                      >
                        Открыть форму
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import { createFormAssignmentAction } from "@/app/admin/actions";
import { FormAssignmentStatus, RoleType } from "@/generated/prisma/client";
import { getAdminScope, hasRole, requireAdminUser } from "@/lib/access";
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

  const [templateVersions, regions, assignments, resolvedSearchParams] =
    await Promise.all([
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
      searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
    ]);

  const params = resolvedSearchParams;
  const createdRaw =
    typeof params.created === "string" ? decodeURIComponent(params.created) : null;
  const created = createdRaw ? createdRaw.split("|") : null;
  const error =
    typeof params.error === "string" ? decodeURIComponent(params.error) : null;

  const publishedVersions = templateVersions.filter(
    (version) => version.status === FormAssignmentStatus.PUBLISHED,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">
          Формы и назначения
        </h2>
        <p className="mt-3 max-w-3xl text-slate-600">
          Суперадмин публикует и направляет исходные формы региональным админам.
          Региональный админ на этой же странице видит, какие формы уже
          назначены его региону на конкретный год.
        </p>

        {created ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Форма `{created[1]}` за `{created[2]}` назначена региону `{created[3]}`.
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {isSuperadmin ? (
          <form action={createFormAssignmentAction} className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 lg:col-span-2">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="templateVersionId"
              >
                Версия формы
              </label>
              <select
                id="templateVersionId"
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

            <div className="lg:col-span-2">
              <button
                type="submit"
                className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
              >
                Назначить форму региону
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Вы видите список форм, которые были назначены вашим регионам
            суперадмином.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">
          Каталог версий форм
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templateVersions.map((version) => (
            <article
              key={version.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
            >
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                {version.template.formType.code}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">
                {version.template.formType.name}
              </h3>
              <p className="mt-2 text-sm text-slate-600">{version.title}</p>
              <p className="mt-3 text-sm text-slate-500">
                Год: {version.reportingYear.year}
              </p>
              <p className="text-sm text-slate-500">Поля: {version.fields.length}</p>
              <p className="text-sm text-slate-500">
                Статус: {formatAssignmentStatus(version.status)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">
          Назначенные формы
        </h2>
        <p className="mt-2 text-slate-600">Всего назначений в доступной зоне: {assignments.length}</p>

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

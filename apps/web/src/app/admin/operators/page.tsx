import { createOperatorAction } from "@/app/admin/actions";
import { RoleType } from "@/generated/prisma/client";
import {
  getAdminScope,
  hasRole,
  requireAdminUser,
} from "@/lib/access";
import { prisma } from "@/lib/prisma";

function formatRole(role: RoleType) {
  switch (role) {
    case RoleType.SUPERADMIN:
      return "Суперадмин";
    case RoleType.REGION_ADMIN:
      return "Региональный админ";
    case RoleType.OPERATOR:
      return "Оператор";
    default:
      return role;
  }
}

export default async function AdminOperatorsPage({
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

  const [regions, operators, resolvedSearchParams] = await Promise.all([
    prisma.region.findMany({
      where: regionFilter,
      orderBy: { fullName: "asc" },
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
            organization: {
              region: regionFilter,
            },
          },
          include: {
            organization: {
              include: {
                region: true,
                parent: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);

  const params = resolvedSearchParams;
  const createdRaw =
    typeof params.created === "string" ? decodeURIComponent(params.created) : null;
  const created = createdRaw ? createdRaw.split("|") : null;
  const error =
    typeof params.error === "string" ? decodeURIComponent(params.error) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold text-slate-950">
            Операторы и организации
          </h2>
          <p className="max-w-3xl text-slate-600">
            Региональный админ может создавать операторов для своего региона и
            сразу указывать поле `Наименование`, чтобы было понятно, какая
            организация будет заполнять формы в сервисе.
          </p>
        </div>

        {created ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Оператор `{created[0]}` создан для организации `{created[1]}` в
            регионе `{created[2]}`.
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form action={createOperatorAction} className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="fullName">
              ФИО оператора
            </label>
            <input
              id="fullName"
              name="fullName"
              required
              minLength={3}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
              placeholder="Петров Петр Петрович"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
              placeholder="operator@example.ru"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="password">
              Временный пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
              placeholder="Минимум 8 символов"
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="organizationName"
            >
              Наименование
            </label>
            <input
              id="organizationName"
              name="organizationName"
              required
              minLength={3}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
              placeholder="Городская больница №1"
            />
          </div>

          <div className="space-y-2 lg:col-span-2">
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

          <div className="lg:col-span-2">
            <button
              type="submit"
              className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
            >
              Создать оператора
            </button>
          </div>
        </form>

        <p className="mt-6 text-sm text-slate-500">
          {isSuperadmin
            ? "Суперадмин может создавать операторов для любого региона."
            : "Региональный админ может создавать операторов только внутри своих регионов."}
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">Текущие операторы</h2>
        <p className="mt-2 text-slate-600">Всего операторов в доступной зоне: {operators.length}</p>

        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600">Оператор</th>
                <th className="px-4 py-3 font-medium text-slate-600">Наименование</th>
                <th className="px-4 py-3 font-medium text-slate-600">Регион</th>
                <th className="px-4 py-3 font-medium text-slate-600">Роль</th>
                <th className="px-4 py-3 font-medium text-slate-600">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {operators.map((operator) => {
                const membership = operator.memberships[0];

                return (
                  <tr key={operator.id} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{operator.fullName}</p>
                      <p className="mt-1 text-slate-500">{operator.email}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">
                        {membership?.organization.name ?? "Не указано"}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {membership?.organization.parent?.name ?? "Без родительской организации"}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {membership?.organization.region?.fullName ?? "Не указан"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {membership ? formatRole(membership.role) : "Нет роли"}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 font-medium ${
                          operator.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {operator.isActive ? "Активен" : "Отключен"}
                      </span>
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

import Link from "next/link";

import { RoleType } from "@/generated/prisma/client";
import { requireSuperadmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { SUBJECT_REGION_WHERE } from "@/lib/regions";
import { createUserAction } from "@/app/admin/actions";

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

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperadmin();

  const [users, organizations, resolvedSearchParams] = await Promise.all([
    prisma.user.findMany({
      include: {
        memberships: {
          include: {
            organization: {
              include: {
                region: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findMany({
      where: {
        region: SUBJECT_REGION_WHERE,
      },
      include: {
        region: true,
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
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
            Управление пользователями
          </h2>
          <p className="max-w-3xl text-slate-600">
            На первом этапе суперадмин может создавать учетные записи и сразу
            привязывать их к роли и организации. Это уже покрывает базовый
            сценарий для региональных центров и операторов.
          </p>
          <Link
            href="/admin/credentials"
            className="inline-flex w-fit rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Открыть страницу доступов
          </Link>
        </div>

        {created ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Пользователь создан. Логин: `{created[0] || "не назначен"}`, email: `{created[1]}`.
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form action={createUserAction} className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="fullName">
              ФИО
            </label>
            <input
              id="fullName"
              name="fullName"
              required
              minLength={3}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400"
              placeholder="Иванов Иван Иванович"
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
              placeholder="region@example.ru"
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
            <label className="text-sm font-medium text-slate-700" htmlFor="role">
              Роль
            </label>
            <select
              id="role"
              name="role"
              defaultValue={RoleType.REGION_ADMIN}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
            >
              <option value={RoleType.SUPERADMIN}>Суперадмин</option>
              <option value={RoleType.REGION_ADMIN}>Региональный админ</option>
              <option value={RoleType.OPERATOR}>Оператор</option>
            </select>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="organizationId"
            >
              Организация
            </label>
            <select
              id="organizationId"
              name="organizationId"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
              defaultValue={organizations[0]?.id}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                  {organization.region ? ` — ${organization.region.shortName}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <button
              type="submit"
              className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
            >
              Создать пользователя
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">
              Текущие пользователи
            </h2>
            <p className="mt-2 text-slate-600">
              Всего учетных записей: {users.length}
            </p>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600">Пользователь</th>
                <th className="px-4 py-3 font-medium text-slate-600">Логин</th>
                <th className="px-4 py-3 font-medium text-slate-600">Роли</th>
                <th className="px-4 py-3 font-medium text-slate-600">Статус</th>
                <th className="px-4 py-3 font-medium text-slate-600">Создан</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {users.map((user) => (
                <tr key={user.id} className="align-top">
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-950">{user.fullName}</p>
                    <p className="mt-1 text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {user.loginCode ? (
                      <code className="rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-slate-800">
                        {user.loginCode}
                      </code>
                    ) : (
                      "Нет"
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      {user.memberships.map((membership) => (
                        <div
                          key={membership.id}
                          className="rounded-2xl bg-slate-50 px-3 py-2 text-slate-700"
                        >
                          <p className="font-medium">{formatRole(membership.role)}</p>
                          <p className="text-slate-500">
                            {membership.organization.name}
                            {membership.organization.region
                              ? ` — ${membership.organization.region.shortName}`
                              : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 font-medium ${
                        user.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {user.isActive ? "Активен" : "Отключен"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-500">
                    {user.createdAt.toLocaleDateString("ru-RU")}
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

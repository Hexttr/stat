import Link from "next/link";

import {
  backfillUserLoginCodesAction,
  provisionRegionAdminsBatchAction,
} from "@/app/admin/actions";
import { CredentialsBatchTable } from "@/app/admin/credentials/credentials-batch-table";
import { OrganizationType, RoleType } from "@/generated/prisma/client";
import { requireSuperadmin } from "@/lib/access";
import { decryptProvisionedPassword } from "@/lib/credentials";
import { prisma } from "@/lib/prisma";
import { SUBJECT_REGION_WHERE } from "@/lib/regions";

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

export default async function AdminCredentialsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperadmin();

  const resolvedSearchParams =
    (await searchParams) ?? ({} as Record<string, string | string[] | undefined>);
  const selectedBatchId =
    typeof resolvedSearchParams.batch === "string"
      ? resolvedSearchParams.batch
      : null;
  const createdCount =
    typeof resolvedSearchParams.created === "string"
      ? Number(resolvedSearchParams.created)
      : null;
  const skippedCount =
    typeof resolvedSearchParams.skipped === "string"
      ? Number(resolvedSearchParams.skipped)
      : null;
  const loginCodesBackfilled =
    typeof resolvedSearchParams.loginCodesBackfilled === "string"
      ? Number(resolvedSearchParams.loginCodesBackfilled)
      : null;
  const error =
    typeof resolvedSearchParams.error === "string"
      ? decodeURIComponent(resolvedSearchParams.error)
      : null;

  const recentBatches = await prisma.credentialProvisionBatch.findMany({
    include: {
      _count: {
        select: {
          entries: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 12,
  });

  const effectiveBatchId = selectedBatchId ?? recentBatches[0]?.id ?? null;

  const [selectedBatch, regionCenters, usersWithoutLoginCode, totalRegionAdmins] = await Promise.all([
    effectiveBatchId
      ? prisma.credentialProvisionBatch.findUnique({
          where: {
            id: effectiveBatchId,
          },
          include: {
            entries: {
              orderBy: [
                {
                  regionNameSnapshot: "asc",
                },
                {
                  createdAt: "asc",
                },
              ],
            },
          },
        })
      : null,
    prisma.organization.findMany({
      where: {
        type: OrganizationType.REGION_CENTER,
        region: SUBJECT_REGION_WHERE,
      },
      include: {
        region: true,
        memberships: {
          where: {
            role: RoleType.REGION_ADMIN,
          },
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        region: {
          fullName: "asc",
        },
      },
    }),
    prisma.user.count({
      where: {
        loginCode: null,
      },
    }),
    prisma.user.count({
      where: {
        memberships: {
          some: {
            role: RoleType.REGION_ADMIN,
            organization: {
              region: SUBJECT_REGION_WHERE,
            },
          },
        },
      },
    }),
  ]);

  const activeRegionAdminRegions = regionCenters.filter((organization) =>
    organization.memberships.some((membership) => membership.user.isActive),
  ).length;

  const batchRows =
    selectedBatch?.entries.map((entry) => ({
      id: entry.id,
      loginCode: entry.loginCodeSnapshot,
      password: decryptProvisionedPassword(entry.passwordEncrypted),
      fullName: entry.fullNameSnapshot,
      email: entry.emailSnapshot,
      regionName: entry.regionNameSnapshot,
      roleLabel: formatRole(entry.roleSnapshot),
    })) ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold text-slate-950">Доступы и логины</h2>
            <p className="mt-2 text-slate-600">
              Здесь можно массово создать по одному региональному админу на каждый субъект,
              получить batch с логинами и паролями, а также дособрать короткие логины для
              уже существующих учетных записей.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <form action={provisionRegionAdminsBatchAction}>
              <button
                type="submit"
                className="w-full rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
              >
                Сгенерировать региональных админов
              </button>
            </form>

            <form action={backfillUserLoginCodesAction}>
              <button
                type="submit"
                className="w-full rounded-2xl border border-slate-300 px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Дособрать логины текущим учеткам
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm text-slate-500">Субъекты с активным региональным админом</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">
              {activeRegionAdminRegions} / {regionCenters.length}
            </p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm text-slate-500">Всего региональных админов</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{totalRegionAdmins}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm text-slate-500">Пользователей без loginCode</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{usersWithoutLoginCode}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-sm text-slate-500">Сохраненных batch</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{recentBatches.length}</p>
          </div>
        </div>

        {createdCount !== null ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Batch сформирован: создано {createdCount}, пропущено {skippedCount ?? 0}.
          </p>
        ) : null}

        {loginCodesBackfilled !== null ? (
          <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Короткие логины добавлены для {loginCodesBackfilled} учетных записей.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Batch логинов и паролей</h2>
            <p className="mt-2 text-slate-600">
              Пароли скрыты по умолчанию. Их можно показать кнопкой с глазом или сразу
              скопировать.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {recentBatches.map((batch) => {
              const isActive = batch.id === effectiveBatchId;

              return (
                <Link
                  key={batch.id}
                  href={`/admin/credentials?batch=${batch.id}`}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {batch.title} ({batch._count.entries})
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-8">
          <CredentialsBatchTable rows={batchRows} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">Покрытие по регионам</h2>
        <p className="mt-2 text-slate-600">
          Быстрая проверка, у каких субъектов уже есть активный региональный админ и какой
          короткий логин закреплен за учеткой.
        </p>

        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600">Регион</th>
                <th className="px-4 py-3 font-medium text-slate-600">Пользователь</th>
                <th className="px-4 py-3 font-medium text-slate-600">Логин</th>
                <th className="px-4 py-3 font-medium text-slate-600">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {regionCenters.map((organization) => {
                const membership = organization.memberships[0];
                const user = membership?.user;

                return (
                  <tr key={organization.id}>
                    <td className="px-4 py-4 font-medium text-slate-950">
                      {organization.region.fullName}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {user ? (
                        <div>
                          <p className="font-medium text-slate-950">{user.fullName}</p>
                          <p className="mt-1 text-slate-500">{user.email}</p>
                        </div>
                      ) : (
                        "Не создан"
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {user?.loginCode ? (
                        <code className="rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-slate-800">
                          {user.loginCode}
                        </code>
                      ) : (
                        "Нет"
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 font-medium ${
                          user?.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {user ? (user.isActive ? "Активен" : "Отключен") : "Не создан"}
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

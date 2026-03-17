import { RoleType } from "@/generated/prisma/client";
import { hasRole, requireAdminUser } from "@/lib/access";

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

export default async function AdminPage() {
  const user = await requireAdminUser();
  const isSuperadmin = hasRole(user, [RoleType.SUPERADMIN]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">
          Добро пожаловать в админку
        </h2>
        <p className="mt-3 max-w-3xl text-slate-600">
          Это общая стартовая страница панели управления. Суперадмин видит
          раздел управления пользователями, а региональные админы могут заходить
          в админскую часть и дальше получать свои рабочие разделы.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">Ваши роли</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {user.memberships.map((membership) => (
            <article
              key={membership.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
            >
              <p className="font-medium text-slate-950">
                {formatRole(membership.role)}
              </p>
              <p className="mt-2 text-slate-600">{membership.organization.name}</p>
              <p className="text-sm text-slate-500">
                {membership.organization.region?.fullName ?? "Без региона"}
              </p>
            </article>
          ))}
        </div>

        {isSuperadmin ? (
          <p className="mt-6 text-sm text-slate-500">
            У вас есть полный доступ, включая управление пользователями.
          </p>
        ) : (
          <p className="mt-6 text-sm text-slate-500">
            Доступ к управлению пользователями ограничен суперадмином, но вход в
            админку для вашей роли уже разрешен.
          </p>
        )}
      </section>
    </div>
  );
}

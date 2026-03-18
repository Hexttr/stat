import { NavLink } from "@/app/admin/nav-link";
import { SignOutForm } from "@/app/admin/sign-out-form";
import { hasRole, requireAdminUser } from "@/lib/access";
import { RoleType } from "@/generated/prisma/client";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireAdminUser();
  const isSuperadmin = hasRole(user, [RoleType.SUPERADMIN]);
  const isRegionAdmin = hasRole(user, [RoleType.REGION_ADMIN]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex w-full items-center justify-between gap-4 px-6 py-4 xl:px-8 2xl:px-10">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-700">
              Stat Admin
            </p>
            <h1 className="text-xl font-semibold text-slate-950">Панель управления</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
            <SignOutForm />
          </div>
        </div>
      </header>

      <div className="grid w-full gap-6 px-6 py-8 xl:px-8 2xl:px-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
          <nav className="space-y-2">
            <NavLink href="/admin">Обзор</NavLink>
            <NavLink href="/admin/forms">Формы</NavLink>
            {isSuperadmin || isRegionAdmin ? (
              <NavLink href="/admin/operators">Операторы</NavLink>
            ) : null}
            {isSuperadmin ? (
              <NavLink href="/admin/users">Пользователи</NavLink>
            ) : null}
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

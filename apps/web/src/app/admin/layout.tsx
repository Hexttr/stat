import Image from "next/image";
import Link from "next/link";

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
    <div className="min-h-screen bg-[#f4f6fb] text-slate-950">
      <div className="min-h-screen w-full">
        <aside className="border-b border-slate-200 bg-white px-6 py-8 lg:fixed lg:inset-y-0 lg:left-0 lg:w-[296px] lg:overflow-hidden lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
          <Link href="/admin" className="flex items-center gap-4">
            <Image src="/logo.png" alt="Логотип" width={88} height={88} priority />
            <div>
              <p className="text-[30px] font-semibold tracking-tight text-slate-950">НМИЦ ИТ</p>
              <p className="mt-1 text-sm text-slate-500">Статистическая платформа</p>
            </div>
          </Link>

          <nav className="mt-10 space-y-1">
            <NavLink href="/admin">Статистика</NavLink>
            <NavLink href="/admin/events">События</NavLink>
            <NavLink href="/admin/prof-exams">Проф.осмотры</NavLink>
            <NavLink href="/admin/recommendations">Рекомендации</NavLink>
            <NavLink href="/admin/knowledge-base">База знаний</NavLink>
            <NavLink href="/admin/feedback">Обратная связь</NavLink>
          </nav>

          <div className="mt-8 border-t border-slate-200 pt-8">
            <p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Управление
            </p>
            <nav className="mt-3 space-y-1">
              <NavLink href="/admin/forms">Формы</NavLink>
              {isSuperadmin ? <NavLink href="/admin/archive/qa">Архив</NavLink> : null}
              {isSuperadmin || isRegionAdmin ? <NavLink href="/admin/operators">Операторы</NavLink> : null}
              {isSuperadmin ? <NavLink href="/admin/users">Пользователи</NavLink> : null}
              {isSuperadmin ? <NavLink href="/admin/credentials">Доступы</NavLink> : null}
            </nav>
          </div>

          <div className="mt-auto rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">{user.fullName}</p>
            <p className="mt-1 text-sm text-slate-500">
              {user.loginCode ? `Логин: ${user.loginCode}` : user.email}
            </p>
            <p className="mt-1 text-xs text-slate-400">{user.email}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">
              {isSuperadmin ? "Суперадмин" : isRegionAdmin ? "Региональный админ" : "Администратор"}
            </p>
            <div className="mt-4">
              <SignOutForm />
            </div>
          </div>
          </div>
        </aside>

        <main className="min-w-0 px-6 py-8 xl:px-10 lg:ml-[296px]">{children}</main>
      </div>
    </div>
  );
}

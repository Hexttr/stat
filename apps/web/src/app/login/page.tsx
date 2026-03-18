import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/app/login/login-form";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user?.id) {
    const hasAdminMembership = session.user.memberships.some(
      (membership) =>
        membership.role === "SUPERADMIN" || membership.role === "REGION_ADMIN",
    );

    redirect(hasAdminMembership ? "/admin" : "/operator");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <section className="grid w-full max-w-5xl gap-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
        <div className="rounded-[1.5rem] bg-slate-950 p-8 text-slate-50">
          <span className="rounded-full bg-blue-500/20 px-3 py-1 text-sm text-blue-200">
            Stat Admin
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight">
            Вход в админку статистического сервиса
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">
            На этом этапе доступен вход для seed-суперадмина. После входа можно
            просматривать пользователей, роли и организации, а затем расширять
            систему конструктором форм и импортом исторических данных.
          </p>
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
              Dev login
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Используйте данные из `apps/web/.env` после выполнения команды
              `npm run prisma:seed`.
            </p>
          </div>
        </div>

        <div className="flex items-center">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}

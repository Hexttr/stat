import Link from "next/link";
import { ReactNode } from "react";

import { requireOperatorUser } from "@/lib/access";

export default async function OperatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireOperatorUser();
  const operatorMembership = user.memberships.find(
    (membership) => membership.role === "OPERATOR",
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex w-full items-center justify-between gap-4 px-6 py-5 xl:px-8 2xl:px-10">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
              Рабочее место оператора
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">
              {operatorMembership?.organization.name ?? user.fullName}
            </h1>
          </div>
          <nav className="flex flex-wrap gap-3">
            <Link
              href="/operator"
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Мои формы
            </Link>
            <Link
              href="/"
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              На главную
            </Link>
          </nav>
        </div>
      </header>

      <main className="px-6 py-6 xl:px-8 2xl:px-10">{children}</main>
    </div>
  );
}

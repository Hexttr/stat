import Link from "next/link";

import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  const hasAdminMembership =
    session?.user?.memberships?.some(
      (membership) =>
        membership.role === "SUPERADMIN" || membership.role === "REGION_ADMIN",
    ) ?? false;
  const defaultAppHref = session?.user?.id
    ? hasAdminMembership
      ? "/admin"
      : "/operator"
    : "/login";
  const steps = [
    {
      title: "1. Роли и организации",
      description:
        "Суперадмины управляют всей системой, региональные админы работают только в своем субъекте, операторы заполняют назначенные формы.",
    },
    {
      title: "2. Версионируемые формы",
      description:
        "Каждый тип формы хранится как шаблон с версиями по годам, чтобы ежегодные изменения не ломали исторические данные.",
    },
    {
      title: "3. Импорт архива",
      description:
        "Исторические .doc/.docx проходят через staging-слой: регистрация файла, распознавание, нормализация, валидация и только потом загрузка в БД.",
    },
    {
      title: "4. Нормализованные метрики",
      description:
        "Дашборд и карта регионов будут строиться по агрегированным метрикам, а не напрямую по сырым значениям форм.",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16 md:px-10">
        <div className="flex flex-col gap-4">
          <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
            Foundation v0
          </span>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Стартовая основа для статистической админки региональных форм
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-slate-600">
            Репозиторий инициализирован как greenfield-проект на Next.js.
            Следующий этап: поднять PostgreSQL, выполнить первую Prisma
            миграцию и собрать админку управления пользователями, регионами и
            организациями.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href={defaultAppHref}
              className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
            >
              {session?.user?.id ? "Открыть рабочий раздел" : "Войти в сервис"}
            </Link>
            <a
              href="#foundation"
              className="rounded-2xl border border-slate-300 px-5 py-3 font-medium text-slate-700 transition hover:bg-white"
            >
              Посмотреть foundation
            </a>
          </div>
        </div>

        <div id="foundation" className="grid gap-4 md:grid-cols-2">
          {steps.map((step) => (
            <article
              key={step.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold">{step.title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{step.description}</p>
            </article>
          ))}
        </div>

        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h2 className="text-2xl font-semibold">Что уже заложено в модели</h2>
            <ul className="mt-4 space-y-3 text-slate-600">
              <li>Пользователи, роли, регионы и иерархия организаций.</li>
              <li>Типы форм, шаблоны, версии по годам и назначения.</li>
              <li>Отправки форм, значения полей и статусы модерации.</li>
              <li>Канонические индикаторы, метрики и агрегированные значения.</li>
              <li>Staging-слой для импорта исторических документов.</li>
            </ul>
          </div>

          <div className="rounded-2xl bg-slate-950 p-6 text-slate-50">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
              Local bootstrap
            </p>
            <pre className="mt-4 overflow-x-auto text-sm leading-7">
              <code>{`docker compose up -d
cd apps/web
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev`}</code>
            </pre>
          </div>
        </section>
      </section>
    </main>
  );
}

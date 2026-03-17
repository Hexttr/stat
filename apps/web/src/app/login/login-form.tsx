"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin";
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError(null);

    const response = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
      callbackUrl,
    });

    setIsPending(false);

    if (!response || response.error) {
      setError("Неверный email или пароль.");
      return;
    }

    router.push(response.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <form
      action={handleSubmit}
      className="flex w-full flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-blue-500"
          placeholder="admin@stat.local"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-blue-500"
          placeholder="Введите пароль"
        />
      </div>

      {error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-2xl bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
      >
        {isPending ? "Входим..." : "Войти"}
      </button>
    </form>
  );
}

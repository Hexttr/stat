"use client";

import { signOut } from "next-auth/react";

export function SignOutForm() {
  return (
    <form
      action={async () => {
        await signOut({ callbackUrl: "/login" });
      }}
    >
      <button
        type="submit"
        className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
      >
        Выйти
      </button>
    </form>
  );
}

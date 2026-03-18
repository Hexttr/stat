import Image from "next/image";
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
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6fb] px-6 py-16">
      <section className="flex w-full max-w-md flex-col items-center gap-8">
        <Image src="/logo.png" alt="Логотип" width={148} height={148} priority />
        <LoginForm />
      </section>
    </main>
  );
}

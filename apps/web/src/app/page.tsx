import { redirect } from "next/navigation";

import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  const hasAdminMembership =
    session?.user?.memberships?.some(
      (membership) =>
        membership.role === "SUPERADMIN" || membership.role === "REGION_ADMIN",
    ) ?? false;
  if (!session?.user?.id) {
    redirect("/login");
  }

  redirect(hasAdminMembership ? "/admin" : "/operator");
}

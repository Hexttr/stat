import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RoleType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      memberships: {
        include: {
          organization: {
            include: {
              region: true,
            },
          },
        },
      },
    },
  });
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireSuperadmin() {
  const user = await requireAuthenticatedUser();

  const isSuperadmin = user.memberships.some(
    (membership) => membership.role === RoleType.SUPERADMIN,
  );

  if (!isSuperadmin) {
    redirect("/");
  }

  return user;
}

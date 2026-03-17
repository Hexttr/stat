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

export function hasRole(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  roles: RoleType[],
) {
  return user.memberships.some((membership) => roles.includes(membership.role));
}

export async function requireAdminUser() {
  const user = await requireAuthenticatedUser();

  const isAdmin = hasRole(user, [RoleType.SUPERADMIN, RoleType.REGION_ADMIN]);

  if (!isAdmin) {
    redirect("/");
  }

  return user;
}

export async function requireSuperadmin() {
  const user = await requireAuthenticatedUser();

  const isSuperadmin = hasRole(user, [RoleType.SUPERADMIN]);

  if (!isSuperadmin) {
    redirect("/admin");
  }

  return user;
}

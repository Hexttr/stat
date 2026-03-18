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

export type AdminUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function hasRole(
  user: AdminUser,
  roles: RoleType[],
) {
  return user.memberships.some((membership) => roles.includes(membership.role));
}

export function getAdminScope(user: AdminUser) {
  const isSuperadmin = hasRole(user, [RoleType.SUPERADMIN]);
  const regionAdminMemberships = user.memberships.filter(
    (membership) => membership.role === RoleType.REGION_ADMIN,
  );

  return {
    isSuperadmin,
    regionAdminMemberships,
    manageableRegionIds: isSuperadmin
      ? null
      : [
          ...new Set(
            regionAdminMemberships
              .map((membership) => membership.organization.regionId)
              .filter((regionId): regionId is string => Boolean(regionId)),
          ),
        ],
  };
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

export async function requireOperatorUser() {
  const user = await requireAuthenticatedUser();

  const isOperator = hasRole(user, [RoleType.OPERATOR]);

  if (!isOperator) {
    redirect("/admin");
  }

  return user;
}

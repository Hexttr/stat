"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { OrganizationType, RoleType } from "@/generated/prisma/client";
import { getAdminScope, requireAdminUser, requireSuperadmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const createUserSchema = z.object({
  fullName: z.string().trim().min(3, "Укажите ФИО."),
  email: z.email("Некорректный email.").transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов."),
  organizationId: z.string().min(1, "Выберите организацию."),
  role: z.enum([RoleType.SUPERADMIN, RoleType.REGION_ADMIN, RoleType.OPERATOR]),
});

const createOperatorSchema = z.object({
  fullName: z.string().trim().min(3, "Укажите ФИО."),
  email: z.email("Некорректный email.").transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов."),
  organizationName: z.string().trim().min(3, "Укажите наименование организации."),
  regionId: z.string().min(1, "Выберите регион."),
});

export async function createUserAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = createUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    organizationId: formData.get("organizationId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/users?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось создать пользователя.",
      )}`,
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: parsed.data.organizationId },
  });

  if (!organization) {
    redirect("/admin/users?error=Выбранная организация не найдена.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (existingUser) {
    redirect("/admin/users?error=Пользователь с таким email уже существует.");
  }

  const passwordHash = await hash(parsed.data.password, 10);

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      passwordHash,
      memberships: {
        create: {
          organizationId: parsed.data.organizationId,
          role: parsed.data.role,
        },
      },
    },
  });

  revalidatePath("/admin/users");
  redirect(`/admin/users?created=${encodeURIComponent(user.email)}`);
}

export async function createOperatorAction(formData: FormData) {
  const currentUser = await requireAdminUser();
  const scope = getAdminScope(currentUser);

  const parsed = createOperatorSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    organizationName: formData.get("organizationName"),
    regionId: formData.get("regionId"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/operators?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось создать оператора.",
      )}`,
    );
  }

  const region = await prisma.region.findUnique({
    where: { id: parsed.data.regionId },
  });

  if (!region) {
    redirect("/admin/operators?error=Выбранный регион не найден.");
  }

  if (
    !scope.isSuperadmin &&
    !scope.manageableRegionIds?.includes(parsed.data.regionId)
  ) {
    redirect("/admin/operators?error=Недостаточно прав для выбранного региона.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (existingUser) {
    redirect("/admin/operators?error=Пользователь с таким email уже существует.");
  }

  const parentOrganization = scope.isSuperadmin
    ? await prisma.organization.findFirst({
        where: {
          regionId: parsed.data.regionId,
          type: OrganizationType.REGION_CENTER,
        },
        orderBy: { createdAt: "asc" },
      })
    : scope.regionAdminMemberships.find(
        (membership) => membership.organization.regionId === parsed.data.regionId,
      )?.organization;

  const organization = await prisma.organization.upsert({
    where: {
      regionId_name: {
        regionId: parsed.data.regionId,
        name: parsed.data.organizationName,
      },
    },
    update: {
      type: OrganizationType.MEDICAL_FACILITY,
      parentId: parentOrganization?.id ?? null,
    },
    create: {
      name: parsed.data.organizationName,
      type: OrganizationType.MEDICAL_FACILITY,
      regionId: parsed.data.regionId,
      parentId: parentOrganization?.id ?? null,
    },
  });

  const passwordHash = await hash(parsed.data.password, 10);

  const operator = await prisma.user.create({
    data: {
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      passwordHash,
      memberships: {
        create: {
          organizationId: organization.id,
          role: RoleType.OPERATOR,
        },
      },
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/operators");
  redirect(
    `/admin/operators?created=${encodeURIComponent(
      `${operator.email}|${organization.name}|${region.fullName}`,
    )}`,
  );
}

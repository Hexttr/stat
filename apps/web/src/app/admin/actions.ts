"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { RoleType } from "@/generated/prisma/client";
import { requireSuperadmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const createUserSchema = z.object({
  fullName: z.string().trim().min(3, "Укажите ФИО."),
  email: z.email("Некорректный email.").transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов."),
  organizationId: z.string().min(1, "Выберите организацию."),
  role: z.enum([RoleType.SUPERADMIN, RoleType.REGION_ADMIN, RoleType.OPERATOR]),
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

"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  FormAssignmentStatus,
  FormTemplateVersionStatus,
  OrganizationType,
  RoleType,
} from "@/generated/prisma/client";
import {
  getAdminScope,
  requireAdminUser,
  requireSuperadmin,
} from "@/lib/access";
import {
  createDefaultFormSchema,
  duplicateFormSchema,
  formBuilderSchema,
  normalizeFormSchema,
} from "@/lib/form-builder/schema";
import { projectSchemaToFields } from "@/lib/form-builder/projection";
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

const updateOperatorProfileSchema = z.object({
  operatorId: z.string().min(1, "Не найден оператор."),
  fullName: z.string().trim().min(3, "Укажите ФИО."),
  email: z.email("Некорректный email.").transform((value) => value.toLowerCase()),
  organizationName: z.string().trim().min(3, "Укажите наименование организации."),
});

const updateOperatorPasswordSchema = z.object({
  operatorId: z.string().min(1, "Не найден оператор."),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов."),
});

const toggleOperatorSchema = z.object({
  operatorId: z.string().min(1, "Не найден оператор."),
});

const createFormAssignmentSchema = z.object({
  templateVersionId: z.string().min(1, "Выберите форму."),
  regionId: z.string().min(1, "Выберите регион."),
  dueDate: z.string().optional(),
});

const createFormTemplateSchema = z.object({
  formTypeId: z.string().min(1, "Выберите тип формы."),
  name: z.string().trim().min(3, "Укажите название шаблона."),
  description: z.string().trim().optional(),
});

const createFormVersionSchema = z.object({
  templateId: z.string().min(1, "Выберите шаблон."),
  reportingYearId: z.string().min(1, "Выберите отчетный год."),
  title: z.string().trim().min(3, "Укажите название версии."),
});

const duplicateFormVersionSchema = z.object({
  sourceVersionId: z.string().min(1, "Выберите исходную версию."),
  reportingYearId: z.string().min(1, "Выберите отчетный год."),
  title: z.string().trim().min(3, "Укажите название версии."),
});

const saveFormVersionSchema = z.object({
  versionId: z.string().min(1, "Не найдена версия формы."),
  title: z.string().trim().min(3, "Укажите название версии."),
  schemaJson: z.string().min(1, "Пустая схема формы."),
});

const publishFormVersionSchema = z.object({
  versionId: z.string().min(1, "Не найдена версия формы."),
});

const createFormAssignmentForAllRegionsSchema = z.object({
  templateVersionId: z.string().min(1, "Выберите форму."),
  dueDate: z.string().optional(),
});

const createOperatorFormAssignmentSchema = z.object({
  regionAssignmentId: z.string().min(1, "Выберите форму, назначенную региону."),
  organizationId: z.string().min(1, "Выберите оператора."),
  dueDate: z.string().optional(),
});

const createOperatorFormAssignmentsForAllSchema = z.object({
  regionAssignmentId: z.string().min(1, "Выберите форму, назначенную региону."),
  dueDate: z.string().optional(),
});

async function getScopedOperator(currentUserId: string, operatorId: string) {
  const currentUser = await requireAdminUser();
  const scope = getAdminScope(currentUser);

  const operator = await prisma.user.findFirst({
    where: {
      id: operatorId,
      memberships: {
        some: {
          role: RoleType.OPERATOR,
          organization: scope.isSuperadmin
            ? {
                region: {
                  code: {
                    not: "RUSSIAN_FEDERATION",
                  },
                },
              }
            : {
                regionId: {
                  in: scope.manageableRegionIds ?? [],
                },
              },
        },
      },
    },
    include: {
      memberships: {
        where: {
          role: RoleType.OPERATOR,
        },
        include: {
          organization: {
            include: {
              region: true,
              parent: true,
            },
          },
        },
      },
    },
  });

  if (!operator) {
    redirect("/admin/operators?error=Оператор не найден или недоступен.");
  }

  if (operator.id === currentUserId) {
    redirect("/admin/operators?error=Нельзя изменить собственную учетную запись этим действием.");
  }

  const membership = operator.memberships[0];

  if (!membership) {
    redirect("/admin/operators?error=У оператора нет активной привязки к организации.");
  }

  return { currentUser, scope, operator, membership };
}

async function getParentOrganizationIdForRegion(
  regionId: string,
  scope: ReturnType<typeof getAdminScope>,
) {
  if (scope.isSuperadmin) {
    const regionCenter = await prisma.organization.findFirst({
      where: {
        regionId,
        type: OrganizationType.REGION_CENTER,
      },
      orderBy: { createdAt: "asc" },
    });

    return regionCenter?.id ?? null;
  }

  return (
    scope.regionAdminMemberships.find(
      (membership) => membership.organization.regionId === regionId,
    )?.organizationId ?? null
  );
}

async function getTemplateVersionForAssignment(templateVersionId: string) {
  const templateVersion = await prisma.formTemplateVersion.findUnique({
    where: { id: templateVersionId },
    include: {
      template: {
        include: {
          formType: true,
        },
      },
      reportingYear: true,
    },
  });

  if (!templateVersion) {
    redirect("/admin/forms?error=Выбранная версия формы не найдена.");
  }

  return templateVersion;
}

async function replaceVersionProjection(params: {
  templateVersionId: string;
  schema: z.infer<typeof formBuilderSchema>;
}) {
  const projectedFields = projectSchemaToFields(params.schema);

  await prisma.$transaction([
    prisma.formField.deleteMany({
      where: { templateVersionId: params.templateVersionId },
    }),
    ...projectedFields.map((field) =>
      prisma.formField.create({
        data: {
          templateVersionId: params.templateVersionId,
          key: field.key,
          label: field.label,
          section: field.section,
          tableId: field.tableId,
          rowId: field.rowId,
          rowKey: field.rowKey,
          columnId: field.columnId,
          columnKey: field.columnKey,
          fieldPath: field.fieldPath,
          fieldType: field.fieldType,
          unit: field.unit,
          placeholder: field.placeholder,
          helpText: field.helpText,
          sortOrder: field.sortOrder,
          isRequired: field.isRequired,
          validationJson: field.validationJson ?? undefined,
        },
      }),
    ),
  ]);
}

async function getEditableFormVersion(versionId: string) {
  await requireSuperadmin();

  const version = await prisma.formTemplateVersion.findUnique({
    where: { id: versionId },
    include: {
      template: {
        include: {
          formType: true,
        },
      },
      reportingYear: true,
      fields: true,
    },
  });

  if (!version) {
    redirect("/admin/forms?error=Версия формы не найдена.");
  }

  return version;
}

async function getRegionCenterOrganization(regionId: string) {
  const regionCenter = await prisma.organization.findFirst({
    where: {
      regionId,
      type: OrganizationType.REGION_CENTER,
    },
    include: {
      region: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!regionCenter) {
    redirect("/admin/forms?error=Для региона не найден региональный центр.");
  }

  return regionCenter;
}

async function getScopedRegionAssignment(regionAssignmentId: string) {
  const currentUser = await requireAdminUser();
  const scope = getAdminScope(currentUser);

  const assignment = await prisma.formAssignment.findFirst({
    where: {
      id: regionAssignmentId,
      organization: {
        type: OrganizationType.REGION_CENTER,
      },
      region: scope.isSuperadmin
        ? {
            code: {
              not: "RUSSIAN_FEDERATION",
            },
          }
        : {
            id: {
              in: scope.manageableRegionIds ?? [],
            },
          },
    },
    include: {
      templateVersion: {
        include: {
          template: {
            include: {
              formType: true,
            },
          },
          reportingYear: true,
        },
      },
      region: true,
      organization: true,
    },
  });

  if (!assignment) {
    redirect("/admin/forms?error=Назначение формы региону не найдено или недоступно.");
  }

  return { currentUser, scope, assignment };
}

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

export async function updateOperatorProfileAction(formData: FormData) {
  const currentUser = await requireAdminUser();
  const parsed = updateOperatorProfileSchema.safeParse({
    operatorId: formData.get("operatorId"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    organizationName: formData.get("organizationName"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/operators?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось обновить оператора.",
      )}`,
    );
  }

  const { operator, membership, scope } = await getScopedOperator(
    currentUser.id,
    parsed.data.operatorId,
  );

  const duplicateEmailUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (duplicateEmailUser && duplicateEmailUser.id !== operator.id) {
    redirect("/admin/operators?error=Пользователь с таким email уже существует.");
  }

  const parentOrganizationId = await getParentOrganizationIdForRegion(
    membership.organization.regionId,
    scope,
  );

  const targetOrganization = await prisma.organization.upsert({
    where: {
      regionId_name: {
        regionId: membership.organization.regionId,
        name: parsed.data.organizationName,
      },
    },
    update: {
      type: OrganizationType.MEDICAL_FACILITY,
      parentId: parentOrganizationId,
    },
    create: {
      name: parsed.data.organizationName,
      type: OrganizationType.MEDICAL_FACILITY,
      regionId: membership.organization.regionId,
      parentId: parentOrganizationId,
    },
  });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: operator.id },
      data: {
        fullName: parsed.data.fullName,
        email: parsed.data.email,
      },
    }),
    prisma.userMembership.update({
      where: { id: membership.id },
      data: {
        organizationId: targetOrganization.id,
      },
    }),
  ]);

  revalidatePath("/admin");
  revalidatePath("/admin/operators");
  redirect(
    `/admin/operators?updated=${encodeURIComponent(
      `${parsed.data.email}|${targetOrganization.name}`,
    )}`,
  );
}

export async function updateOperatorPasswordAction(formData: FormData) {
  const currentUser = await requireAdminUser();
  const parsed = updateOperatorPasswordSchema.safeParse({
    operatorId: formData.get("operatorId"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/operators?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось обновить пароль оператора.",
      )}`,
    );
  }

  const { operator } = await getScopedOperator(currentUser.id, parsed.data.operatorId);
  const passwordHash = await hash(parsed.data.password, 10);

  await prisma.user.update({
    where: { id: operator.id },
    data: {
      passwordHash,
    },
  });

  revalidatePath("/admin/operators");
  redirect(`/admin/operators?passwordUpdated=${encodeURIComponent(operator.email)}`);
}

export async function toggleOperatorActiveAction(formData: FormData) {
  const currentUser = await requireAdminUser();
  const parsed = toggleOperatorSchema.safeParse({
    operatorId: formData.get("operatorId"),
  });

  if (!parsed.success) {
    redirect("/admin/operators?error=Не удалось изменить статус оператора.");
  }

  const { operator } = await getScopedOperator(currentUser.id, parsed.data.operatorId);

  const updatedOperator = await prisma.user.update({
    where: { id: operator.id },
    data: {
      isActive: !operator.isActive,
    },
  });

  revalidatePath("/admin/operators");
  redirect(
    `/admin/operators?statusChanged=${encodeURIComponent(
      `${updatedOperator.email}|${updatedOperator.isActive ? "enabled" : "disabled"}`,
    )}`,
  );
}

export async function createFormAssignmentAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = createFormAssignmentSchema.safeParse({
    templateVersionId: formData.get("templateVersionId"),
    regionId: formData.get("regionId"),
    dueDate: formData.get("dueDate"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось назначить форму.",
      )}`,
    );
  }

  const templateVersion = await getTemplateVersionForAssignment(
    parsed.data.templateVersionId,
  );
  const regionCenter = await getRegionCenterOrganization(parsed.data.regionId);

  const existingAssignment = await prisma.formAssignment.findFirst({
    where: {
      templateVersionId: templateVersion.id,
      reportingYearId: templateVersion.reportingYearId,
      regionId: parsed.data.regionId,
      organizationId: regionCenter.id,
    },
  });

  if (existingAssignment) {
    redirect("/admin/forms?error=Эта форма уже назначена выбранному региону.");
  }

  const assignment = await prisma.formAssignment.create({
    data: {
      templateVersionId: templateVersion.id,
      reportingYearId: templateVersion.reportingYearId,
      regionId: parsed.data.regionId,
      organizationId: regionCenter.id,
      status: FormAssignmentStatus.PUBLISHED,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/forms");
  redirect(
    `/admin/forms?created=${encodeURIComponent(
      `${assignment.id}|${templateVersion.template.formType.name}|${templateVersion.reportingYear.year}|${regionCenter.region.fullName}`,
    )}`,
  );
}

export async function createFormTemplateAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = createFormTemplateSchema.safeParse({
    formTypeId: formData.get("formTypeId"),
    name: formData.get("name"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось создать шаблон формы.",
      )}`,
    );
  }

  const existingTemplate = await prisma.formTemplate.findFirst({
    where: {
      formTypeId: parsed.data.formTypeId,
      name: parsed.data.name,
    },
  });

  if (existingTemplate) {
    redirect("/admin/forms?error=Шаблон с таким названием уже существует.");
  }

  const template = await prisma.formTemplate.create({
    data: {
      formTypeId: parsed.data.formTypeId,
      name: parsed.data.name,
      description: parsed.data.description || null,
    },
  });

  revalidatePath("/admin/forms");
  redirect(`/admin/forms?templateCreated=${encodeURIComponent(template.name)}`);
}

export async function createFormVersionAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = createFormVersionSchema.safeParse({
    templateId: formData.get("templateId"),
    reportingYearId: formData.get("reportingYearId"),
    title: formData.get("title"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось создать версию формы.",
      )}`,
    );
  }

  const template = await prisma.formTemplate.findUnique({
    where: { id: parsed.data.templateId },
    include: {
      formType: true,
    },
  });

  const reportingYear = await prisma.reportingYear.findUnique({
    where: { id: parsed.data.reportingYearId },
  });

  if (!template || !reportingYear) {
    redirect("/admin/forms?error=Не удалось определить шаблон или отчетный год.");
  }

  const latestVersion = await prisma.formTemplateVersion.findFirst({
    where: {
      templateId: parsed.data.templateId,
      reportingYearId: parsed.data.reportingYearId,
    },
    orderBy: { version: "desc" },
  });

  const nextVersionNumber = (latestVersion?.version ?? 0) + 1;
  const schema = createDefaultFormSchema({
    formCode: template.formType.code,
    title: parsed.data.title,
    reportingYear: reportingYear.year,
    description: template.description,
  });

  const version = await prisma.formTemplateVersion.create({
    data: {
      templateId: parsed.data.templateId,
      reportingYearId: parsed.data.reportingYearId,
      version: nextVersionNumber,
      title: parsed.data.title,
      versionStatus: FormTemplateVersionStatus.DRAFT,
      schemaJson: schema,
    },
  });

  await replaceVersionProjection({
    templateVersionId: version.id,
    schema,
  });

  revalidatePath("/admin/forms");
  redirect(`/admin/forms/builder/${version.id}`);
}

export async function duplicateFormVersionAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = duplicateFormVersionSchema.safeParse({
    sourceVersionId: formData.get("sourceVersionId"),
    reportingYearId: formData.get("reportingYearId"),
    title: formData.get("title"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось дублировать версию формы.",
      )}`,
    );
  }

  const sourceVersion = await prisma.formTemplateVersion.findUnique({
    where: { id: parsed.data.sourceVersionId },
    include: {
      template: {
        include: {
          formType: true,
        },
      },
    },
  });

  const reportingYear = await prisma.reportingYear.findUnique({
    where: { id: parsed.data.reportingYearId },
  });

  if (!sourceVersion || !reportingYear) {
    redirect("/admin/forms?error=Не удалось определить исходную версию или отчетный год.");
  }

  const latestVersion = await prisma.formTemplateVersion.findFirst({
    where: {
      templateId: sourceVersion.templateId,
      reportingYearId: parsed.data.reportingYearId,
    },
    orderBy: { version: "desc" },
  });

  const nextVersionNumber = (latestVersion?.version ?? 0) + 1;
  const sourceSchema = formBuilderSchema.parse(sourceVersion.schemaJson);
  const duplicatedSchema = duplicateFormSchema(sourceSchema, {
    title: parsed.data.title,
    reportingYear: reportingYear.year,
  });

  const version = await prisma.formTemplateVersion.create({
    data: {
      templateId: sourceVersion.templateId,
      reportingYearId: parsed.data.reportingYearId,
      version: nextVersionNumber,
      title: parsed.data.title,
      versionStatus: FormTemplateVersionStatus.DRAFT,
      schemaJson: duplicatedSchema,
    },
  });

  await replaceVersionProjection({
    templateVersionId: version.id,
    schema: duplicatedSchema,
  });

  revalidatePath("/admin/forms");
  redirect(`/admin/forms/builder/${version.id}`);
}

export async function saveFormVersionDraftAction(formData: FormData) {
  const version = await getEditableFormVersion(String(formData.get("versionId") ?? ""));

  const parsed = saveFormVersionSchema.safeParse({
    versionId: formData.get("versionId"),
    title: formData.get("title"),
    schemaJson: formData.get("schemaJson"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms/builder/${version.id}?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось сохранить черновик формы.",
      )}`,
    );
  }

  if (version.versionStatus === FormTemplateVersionStatus.PUBLISHED) {
    redirect(
      `/admin/forms/builder/${version.id}?error=${encodeURIComponent(
        "Опубликованную версию нельзя редактировать. Создайте новую версию.",
      )}`,
    );
  }

  const rawSchema = JSON.parse(parsed.data.schemaJson);
  const normalizedSchema = normalizeFormSchema(formBuilderSchema.parse(rawSchema));

  await prisma.formTemplateVersion.update({
    where: { id: version.id },
    data: {
      title: parsed.data.title,
      schemaJson: normalizedSchema,
      versionStatus: FormTemplateVersionStatus.DRAFT,
    },
  });

  await replaceVersionProjection({
    templateVersionId: version.id,
    schema: normalizedSchema,
  });

  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/builder/${version.id}`);
  redirect(`/admin/forms/builder/${version.id}?saved=1`);
}

export async function publishFormVersionAction(formData: FormData) {
  const currentUser = await requireSuperadmin();

  const parsed = publishFormVersionSchema.safeParse({
    versionId: formData.get("versionId"),
  });

  if (!parsed.success) {
    redirect("/admin/forms?error=Не удалось опубликовать версию формы.");
  }

  const version = await getEditableFormVersion(parsed.data.versionId);
  const schema = normalizeFormSchema(formBuilderSchema.parse(version.schemaJson));

  await prisma.formTemplateVersion.update({
    where: { id: version.id },
    data: {
      title: schema.meta.title,
      schemaJson: schema,
      versionStatus: FormTemplateVersionStatus.PUBLISHED,
      publishedAt: new Date(),
      publishedById: currentUser.id,
    },
  });

  await replaceVersionProjection({
    templateVersionId: version.id,
    schema,
  });

  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/builder/${version.id}`);
  redirect(`/admin/forms/builder/${version.id}?published=1`);
}

export async function createFormAssignmentForAllRegionsAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = createFormAssignmentForAllRegionsSchema.safeParse({
    templateVersionId: formData.get("templateVersionId"),
    dueDate: formData.get("dueDate"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось назначить форму всем регионам.",
      )}`,
    );
  }

  const templateVersion = await getTemplateVersionForAssignment(
    parsed.data.templateVersionId,
  );

  const regionCenters = await prisma.organization.findMany({
    where: {
      type: OrganizationType.REGION_CENTER,
      region: {
        code: {
          not: "RUSSIAN_FEDERATION",
        },
      },
    },
    include: {
      region: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const existingAssignments = await prisma.formAssignment.findMany({
    where: {
      templateVersionId: templateVersion.id,
      reportingYearId: templateVersion.reportingYearId,
      organizationId: {
        in: regionCenters.map((organization) => organization.id),
      },
    },
    select: {
      organizationId: true,
    },
  });

  const existingOrganizationIds = new Set(
    existingAssignments.map((assignment) => assignment.organizationId),
  );

  const organizationsToAssign = regionCenters.filter(
    (organization) => !existingOrganizationIds.has(organization.id),
  );

  if (organizationsToAssign.length === 0) {
    redirect("/admin/forms?error=Эта форма уже назначена всем регионам.");
  }

  const createdAssignments = await prisma.$transaction(
    organizationsToAssign.map((organization) =>
      prisma.formAssignment.create({
        data: {
          templateVersionId: templateVersion.id,
          reportingYearId: templateVersion.reportingYearId,
          regionId: organization.regionId,
          organizationId: organization.id,
          status: FormAssignmentStatus.PUBLISHED,
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        },
      }),
    ),
  );

  revalidatePath("/admin");
  revalidatePath("/admin/forms");
  redirect(
    `/admin/forms?bulkCreated=${encodeURIComponent(
      `${createdAssignments.length}|${templateVersion.template.formType.name}|${templateVersion.reportingYear.year}|regions`,
    )}`,
  );
}

export async function createOperatorFormAssignmentAction(formData: FormData) {
  const { assignment, scope } = await getScopedRegionAssignment(
    String(formData.get("regionAssignmentId") ?? ""),
  );

  const parsed = createOperatorFormAssignmentSchema.safeParse({
    regionAssignmentId: formData.get("regionAssignmentId"),
    organizationId: formData.get("organizationId"),
    dueDate: formData.get("dueDate"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось назначить форму оператору.",
      )}`,
    );
  }

  const operatorOrganization = await prisma.organization.findFirst({
    where: {
      id: parsed.data.organizationId,
      type: OrganizationType.MEDICAL_FACILITY,
      regionId: assignment.regionId,
      memberships: {
        some: {
          role: RoleType.OPERATOR,
        },
      },
      ...(scope.isSuperadmin
        ? {}
        : {
            regionId: {
              in: scope.manageableRegionIds ?? [],
            },
          }),
    },
    include: {
      region: true,
    },
  });

  if (!operatorOrganization) {
    redirect("/admin/forms?error=Выбранный оператор или его организация не найдены.");
  }

  const existingAssignment = await prisma.formAssignment.findFirst({
    where: {
      templateVersionId: assignment.templateVersionId,
      reportingYearId: assignment.reportingYearId,
      regionId: assignment.regionId,
      organizationId: operatorOrganization.id,
    },
  });

  if (existingAssignment) {
    redirect("/admin/forms?error=Эта форма уже назначена выбранному оператору.");
  }

  await prisma.formAssignment.create({
    data: {
      templateVersionId: assignment.templateVersionId,
      reportingYearId: assignment.reportingYearId,
      regionId: assignment.regionId,
      organizationId: operatorOrganization.id,
      status: FormAssignmentStatus.PUBLISHED,
      dueDate: parsed.data.dueDate
        ? new Date(parsed.data.dueDate)
        : assignment.dueDate,
    },
  });

  revalidatePath("/admin/forms");
  redirect(
    `/admin/forms?operatorCreated=${encodeURIComponent(
      `${assignment.templateVersion.template.formType.name}|${operatorOrganization.name}|${assignment.region.fullName}`,
    )}`,
  );
}

export async function createOperatorFormAssignmentsForAllAction(formData: FormData) {
  const { assignment, scope } = await getScopedRegionAssignment(
    String(formData.get("regionAssignmentId") ?? ""),
  );

  const parsed = createOperatorFormAssignmentsForAllSchema.safeParse({
    regionAssignmentId: formData.get("regionAssignmentId"),
    dueDate: formData.get("dueDate"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось назначить форму всем операторам.",
      )}`,
    );
  }

  const operatorOrganizations = await prisma.organization.findMany({
    where: {
      type: OrganizationType.MEDICAL_FACILITY,
      regionId: assignment.regionId,
      memberships: {
        some: {
          role: RoleType.OPERATOR,
        },
      },
      ...(scope.isSuperadmin
        ? {}
        : {
            regionId: {
              in: scope.manageableRegionIds ?? [],
            },
          }),
    },
    orderBy: { name: "asc" },
  });

  if (operatorOrganizations.length === 0) {
    redirect("/admin/forms?error=В этом регионе пока нет операторов для назначения формы.");
  }

  const existingAssignments = await prisma.formAssignment.findMany({
    where: {
      templateVersionId: assignment.templateVersionId,
      reportingYearId: assignment.reportingYearId,
      regionId: assignment.regionId,
      organizationId: {
        in: operatorOrganizations.map((organization) => organization.id),
      },
    },
    select: {
      organizationId: true,
    },
  });

  const existingOrganizationIds = new Set(
    existingAssignments.map((existingAssignment) => existingAssignment.organizationId),
  );

  const organizationsToAssign = operatorOrganizations.filter(
    (organization) => !existingOrganizationIds.has(organization.id),
  );

  if (organizationsToAssign.length === 0) {
    redirect("/admin/forms?error=Эта форма уже назначена всем операторам региона.");
  }

  const createdAssignments = await prisma.$transaction(
    organizationsToAssign.map((organization) =>
      prisma.formAssignment.create({
        data: {
          templateVersionId: assignment.templateVersionId,
          reportingYearId: assignment.reportingYearId,
          regionId: assignment.regionId,
          organizationId: organization.id,
          status: FormAssignmentStatus.PUBLISHED,
          dueDate: parsed.data.dueDate
            ? new Date(parsed.data.dueDate)
            : assignment.dueDate,
        },
      }),
    ),
  );

  revalidatePath("/admin/forms");
  redirect(
    `/admin/forms?bulkCreated=${encodeURIComponent(
      `${createdAssignments.length}|${assignment.templateVersion.template.formType.name}|${assignment.templateVersion.reportingYear.year}|operators`,
    )}`,
  );
}

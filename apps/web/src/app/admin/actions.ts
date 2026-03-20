"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  ArchiveQaIssueScale,
  ArchiveQaIssueStatus,
  ArchiveQaIssueType,
  FormAssignmentStatus,
  FormTemplateVersionStatus,
  OrganizationType,
  RoleType,
  SubmissionStatus,
} from "@/generated/prisma/client";
import {
  getAdminScope,
  requireAdminUser,
  requireSuperadmin,
} from "@/lib/access";
import {
  applyArchiveF12PilotMapping,
  createArchivePilotRegionSubmissions,
  ensureArchiveYearlyFormVersions,
  importArchiveRawValuesToStaging,
  importHandoffArchiveRegistry,
  syncCanonicalRegionsFromHandoff,
} from "@/lib/archive/service";
import {
  normalizeRuntimeValue,
  RuntimeValueMap,
  validateRuntimeValues,
} from "@/lib/form-builder/runtime";
import {
  createDefaultFormSchema,
  duplicateFormSchema,
  formBuilderSchema,
  parseAndNormalizeFormSchema,
} from "@/lib/form-builder/schema";
import {
  importLegacyFormBundle,
  isLegacyFormCode,
} from "@/lib/form-builder/legacy-import";
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

const createFormTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Укажите код формы.")
    .max(20, "Код формы слишком длинный.")
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3, "Укажите название формы."),
  description: z.string().trim().optional(),
});

const createFormVersionSchema = z.object({
  templateId: z.string().min(1, "Выберите шаблон."),
  reportingYearId: z.string().min(1, "Выберите отчетный год."),
  title: z.string().trim().min(3, "Укажите название версии."),
});

const importLegacyFormVersionSchema = z.object({
  formTypeId: z.string().min(1, "Выберите тип формы."),
  reportingYearId: z.string().min(1, "Выберите отчетный год."),
  title: z.string().trim().min(3, "Укажите название импортируемой версии."),
});

const duplicateFormVersionSchema = z.object({
  sourceVersionId: z.string().min(1, "Выберите исходную версию."),
  reportingYearId: z.string().min(1, "Выберите отчетный год."),
  title: z.string().trim().min(3, "Укажите название версии."),
});

const deleteFormVersionSchema = z.object({
  versionId: z.string().min(1, "Не найдена версия формы."),
  returnTo: z.string().trim().optional(),
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

const regionSubmissionPayloadSchema = z.object({
  assignmentId: z.string().min(1, "Не найдено назначение формы региону."),
  valuesJson: z.string().min(2, "Пустые данные формы."),
});

const reviewedSubmissionPayloadSchema = z.object({
  submissionId: z.string().min(1, "Не найдена отправка формы."),
  valuesJson: z.string().min(2, "Пустые данные формы."),
  returnTo: z.string().trim().optional(),
});

const archivePilotImportSchema = z.object({
  formCode: z.string().trim().min(1, "Укажите код формы."),
  year: z.coerce.number().int().min(2019).max(2026),
});

const archiveValueImportSchema = z.object({
  formCode: z.string().trim().min(1, "Укажите код формы."),
  year: z.coerce.number().int().min(2019).max(2026),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const archiveMappingSchema = z.object({
  year: z.coerce.number().int().min(2019).max(2026),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const archiveReturnToSchema = z.object({
  returnTo: z.string().trim().optional(),
});

const createArchiveQaIssueSchema = z.object({
  importFileId: z.string().min(1, "Не найден архивный файл."),
  submissionId: z.string().trim().optional(),
  returnTo: z.string().trim().optional(),
  type: z.enum([
    ArchiveQaIssueType.REGION,
    ArchiveQaIssueType.EXTRACTION,
    ArchiveQaIssueType.MAPPING,
    ArchiveQaIssueType.SCHEMA,
    ArchiveQaIssueType.MANUAL,
  ]),
  scale: z.enum([
    ArchiveQaIssueScale.SINGLE_VALUE,
    ArchiveQaIssueScale.BLOCK,
    ArchiveQaIssueScale.FILE,
    ArchiveQaIssueScale.SYSTEMIC,
  ]),
  title: z.string().trim().min(5, "Коротко сформулируйте проблему."),
  description: z.string().trim().min(10, "Опишите проблему чуть подробнее."),
  rawEvidence: z.string().trim().optional(),
  expectedResult: z.string().trim().optional(),
  actualResult: z.string().trim().optional(),
});

const reviewSubmissionSchema = z.object({
  submissionId: z.string().min(1, "Не найдена отправка формы."),
  decision: z.enum([
    "start_review",
    "request_changes",
    "approve_region",
    "approve_superadmin",
    "reject",
  ]),
  reviewComment: z.string().trim().max(2000, "Комментарий слишком длинный.").optional(),
  returnTo: z.string().trim().optional(),
});

function appendSearchParam(url: string, param: string) {
  const [base, hash] = url.split("#");
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${param}${hash ? `#${hash}` : ""}`;
}

function parseRuntimeValues(rawJson: string) {
  const rawPayload = JSON.parse(rawJson) as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(rawPayload).map(([key, value]) => {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        return [key, value];
      }

      return [key, ""];
    }),
  ) satisfies RuntimeValueMap;
}

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
  const createManyPayload = projectedFields.map((field) => ({
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
  }));

  const chunkSize = 500;
  const payloadChunks = Array.from(
    { length: Math.ceil(createManyPayload.length / chunkSize) },
    (_, index) => createManyPayload.slice(index * chunkSize, (index + 1) * chunkSize),
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.formField.deleteMany({
        where: { templateVersionId: params.templateVersionId },
      });

      for (const chunk of payloadChunks) {
        if (chunk.length === 0) {
          continue;
        }

        await tx.formField.createMany({
          data: chunk,
        });
      }
    },
    {
      timeout: 30_000,
    },
  );
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

async function getScopedRegionInputAssignment(assignmentId: string) {
  const currentUser = await requireAdminUser();
  const scope = getAdminScope(currentUser);

  const assignment = await prisma.formAssignment.findFirst({
    where: {
      id: assignmentId,
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
          fields: true,
          template: {
            include: {
              formType: true,
            },
          },
          reportingYear: true,
        },
      },
      organization: true,
      region: true,
      reportingYear: true,
    },
  });

  if (!assignment) {
    redirect("/admin/forms?error=Назначение формы региону не найдено или недоступно.");
  }

  return { currentUser, scope, assignment };
}

async function persistRegionSubmission(params: {
  assignmentId: string;
  values: RuntimeValueMap;
  status: SubmissionStatus;
  submittedById?: string | null;
}) {
  const { currentUser, assignment } = await getScopedRegionInputAssignment(params.assignmentId);
  formBuilderSchema.parse(assignment.templateVersion.schemaJson);

  const fieldMap = new Map(assignment.templateVersion.fields.map((field) => [field.key, field]));
  const normalizedEntries = Object.entries(params.values)
    .map(([fieldKey, rawValue]) => {
      const field = fieldMap.get(fieldKey);
      if (!field) {
        return null;
      }

      const normalizedValue = normalizeRuntimeValue(field.fieldType, rawValue);
      if (normalizedValue.isEmpty) {
        return null;
      }

      return {
        fieldId: field.id,
        ...normalizedValue,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const existingSubmission = await prisma.submission.findFirst({
    where: {
      assignmentId: assignment.id,
      organizationId: assignment.organizationId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const submission = existingSubmission
    ? await prisma.submission.update({
        where: {
          id: existingSubmission.id,
        },
        data: {
          status: params.status,
          submittedById:
            params.status === SubmissionStatus.SUBMITTED
              ? params.submittedById ?? currentUser.id
              : undefined,
          submittedAt: params.status === SubmissionStatus.SUBMITTED ? new Date() : null,
        },
      })
    : await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          organizationId: assignment.organizationId,
          status: params.status,
          submittedById:
            params.status === SubmissionStatus.SUBMITTED
              ? params.submittedById ?? currentUser.id
              : null,
          submittedAt: params.status === SubmissionStatus.SUBMITTED ? new Date() : null,
        },
      });

  await prisma.$transaction([
    prisma.submissionValue.deleteMany({
      where: {
        submissionId: submission.id,
      },
    }),
    ...(normalizedEntries.length > 0
      ? [
          prisma.submissionValue.createMany({
            data: normalizedEntries.map((entry) => ({
              submissionId: submission.id,
              fieldId: entry.fieldId,
              valueText: entry.valueText ?? undefined,
              valueNumber: entry.valueNumber ?? undefined,
              valueBoolean: entry.valueBoolean ?? undefined,
              valueJson: entry.valueJson ?? undefined,
            })),
          }),
        ]
      : []),
  ]);
}

async function getScopedSubmissionForReview(submissionId: string) {
  const currentUser = await requireAdminUser();
  const scope = getAdminScope(currentUser);

  const submission = await prisma.submission.findFirst({
    where: {
      id: submissionId,
      assignment: scope.isSuperadmin
        ? undefined
        : {
            regionId: {
              in: scope.manageableRegionIds ?? [],
            },
          },
    },
    include: {
      assignment: {
        include: {
          region: true,
          organization: true,
          templateVersion: {
            include: {
              template: {
                include: {
                  formType: true,
                },
              },
              reportingYear: true,
              fields: true,
            },
          },
        },
      },
      organization: true,
      submittedBy: true,
      reviewedBy: true,
      values: true,
    },
  });

  if (!submission) {
    redirect("/admin/forms?error=Отправка формы не найдена или недоступна.");
  }

  if (!scope.isSuperadmin && submission.assignment.organization.type !== OrganizationType.MEDICAL_FACILITY) {
    redirect("/admin/forms?error=Региональный администратор может проверять только формы операторов.");
  }

  if (
    scope.isSuperadmin &&
    submission.assignment.organization.type !== OrganizationType.REGION_CENTER &&
    submission.status !== SubmissionStatus.APPROVED_BY_REGION &&
    submission.status !== SubmissionStatus.IN_REVIEW &&
    submission.status !== SubmissionStatus.CHANGES_REQUESTED &&
    submission.status !== SubmissionStatus.REJECTED
  ) {
    redirect("/admin/forms?error=Эта отправка пока недоступна для проверки на федеральном уровне.");
  }

  return { currentUser, scope, submission };
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

export async function createFormTypeAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = createFormTypeSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось создать тип формы.",
      )}`,
    );
  }

  const existingFormType = await prisma.formType.findFirst({
    where: {
      code: parsed.data.code,
    },
  });

  if (existingFormType) {
    redirect("/admin/forms?error=Тип формы с таким кодом уже существует.");
  }

  const formType = await prisma.formType.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description || null,
    },
  });

  revalidatePath("/admin/forms");
  redirect(
    `/admin/forms?formTypeCreated=${encodeURIComponent(
      `${formType.code}|${formType.name}`,
    )}`,
  );
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

export async function importLegacyFormVersionAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = importLegacyFormVersionSchema.safeParse({
    formTypeId: formData.get("formTypeId"),
    reportingYearId: formData.get("reportingYearId"),
    title: formData.get("title"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось импортировать форму из архива 2024.",
      )}`,
    );
  }

  const formType = await prisma.formType.findUnique({
    where: { id: parsed.data.formTypeId },
  });
  const reportingYear = await prisma.reportingYear.findUnique({
    where: { id: parsed.data.reportingYearId },
  });

  if (!formType || !reportingYear) {
    redirect("/admin/forms?error=Не удалось определить тип формы или отчетный год.");
  }

  if (!isLegacyFormCode(formType.code)) {
    redirect("/admin/forms?error=Для этого типа формы еще не настроен импорт из архива 2024.");
  }

  let template = await prisma.formTemplate.findFirst({
    where: {
      formTypeId: formType.id,
      name: `${formType.name} — архивная структура 2024`,
    },
  });

  if (!template) {
    template = await prisma.formTemplate.create({
      data: {
        formTypeId: formType.id,
        name: `${formType.name} — архивная структура 2024`,
        description: "Шаблон, импортированный из реальных файлов федерального статистического наблюдения за 2024 год.",
      },
    });
  }

  const latestVersion = await prisma.formTemplateVersion.findFirst({
    where: {
      templateId: template.id,
      reportingYearId: reportingYear.id,
    },
    orderBy: { version: "desc" },
  });

  const nextVersionNumber = (latestVersion?.version ?? 0) + 1;
  const importResult = await importLegacyFormBundle({
    formCode: formType.code,
    reportingYear: reportingYear.year,
    title: parsed.data.title,
  });
  const { schema, diagnostics } = importResult;

  const version = await prisma.formTemplateVersion.create({
    data: {
      templateId: template.id,
      reportingYearId: reportingYear.id,
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
  const importedPayload = encodeURIComponent(
    [
      diagnostics.selectedFileName,
      String(diagnostics.tableCount),
      String(diagnostics.totalRows),
      String(diagnostics.fileCount),
    ].join("|"),
  );
  const warningPayload =
    diagnostics.fallbackUsed || diagnostics.warnings.length > 0
      ? `&warning=${encodeURIComponent(
          diagnostics.warnings[0] ??
            "Импорт выполнен с fallback-структурой. Проверьте форму особенно внимательно.",
        )}`
      : "";

  redirect(`/admin/forms/builder/${version.id}?imported=${importedPayload}${warningPayload}`);
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

export async function deleteFormVersionAction(formData: FormData) {
  await requireSuperadmin();
  const rawReturnTo = String(formData.get("returnTo") ?? "/admin/forms");
  const redirectWithError = (message: string): never => {
    redirect(
      `${rawReturnTo}${rawReturnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`,
    );
  };

  const parsed = deleteFormVersionSchema.safeParse({
    versionId: formData.get("versionId"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message ?? "Не удалось удалить версию формы.");
  }
  const parsedData = parsed.data as z.infer<typeof deleteFormVersionSchema>;

  const version = await prisma.formTemplateVersion.findUnique({
    where: { id: parsedData.versionId },
    include: {
      assignments: {
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });

  if (!version) {
    redirectWithError("Версия формы не найдена.");
  }
  const existingVersion = version!;

  if (existingVersion.assignments.length > 0) {
    redirectWithError(
      "Версию нельзя удалить, пока она используется в маршрутах или назначениях.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.formField.deleteMany({
      where: { templateVersionId: existingVersion.id },
    });

    await tx.formTemplateVersion.delete({
      where: { id: existingVersion.id },
    });
  });

  revalidatePath("/admin/forms");
  redirect(parsedData.returnTo || "/admin/forms");
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
  const normalizedSchema = parseAndNormalizeFormSchema(rawSchema);

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
  const schema = parseAndNormalizeFormSchema(version.schemaJson);

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

export async function saveRegionSubmissionDraftAction(formData: FormData) {
  const parsed = regionSubmissionPayloadSchema.parse({
    assignmentId: formData.get("assignmentId"),
    valuesJson: formData.get("valuesJson"),
  });

  const values = parseRuntimeValues(parsed.valuesJson);

  await persistRegionSubmission({
    assignmentId: parsed.assignmentId,
    values,
    status: SubmissionStatus.DRAFT,
  });

  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/assignments/${parsed.assignmentId}`);
  redirect(`/admin/forms/assignments/${parsed.assignmentId}?saved=1`);
}

export async function submitRegionSubmissionAction(formData: FormData) {
  const parsed = regionSubmissionPayloadSchema.parse({
    assignmentId: formData.get("assignmentId"),
    valuesJson: formData.get("valuesJson"),
  });

  const { currentUser, assignment } = await getScopedRegionInputAssignment(parsed.assignmentId);
  const schema = formBuilderSchema.parse(assignment.templateVersion.schemaJson);
  const values = parseRuntimeValues(parsed.valuesJson);
  const validationErrors = validateRuntimeValues(schema, values);

  if (Object.keys(validationErrors).length > 0) {
    redirect(
      `/admin/forms/assignments/${parsed.assignmentId}?error=${encodeURIComponent(
        "Заполните обязательные поля и исправьте ошибки перед отправкой региона.",
      )}`,
    );
  }

  await persistRegionSubmission({
    assignmentId: parsed.assignmentId,
    values,
    status: SubmissionStatus.SUBMITTED,
    submittedById: currentUser.id,
  });

  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/assignments/${parsed.assignmentId}`);
  redirect(`/admin/forms/assignments/${parsed.assignmentId}?submitted=1`);
}

export async function saveReviewedSubmissionValuesAction(formData: FormData) {
  const parsed = reviewedSubmissionPayloadSchema.parse({
    submissionId: formData.get("submissionId"),
    valuesJson: formData.get("valuesJson"),
    returnTo: formData.get("returnTo"),
  });

  const { submission } = await getScopedSubmissionForReview(parsed.submissionId);
  const values = parseRuntimeValues(parsed.valuesJson);
  const fieldMap = new Map(
    submission.assignment.templateVersion.fields.map((field) => [field.key, field]),
  );
  const normalizedEntries = Object.entries(values)
    .map(([fieldKey, rawValue]) => {
      const field = fieldMap.get(fieldKey);
      if (!field) {
        return null;
      }

      const normalizedValue = normalizeRuntimeValue(field.fieldType, rawValue);
      if (normalizedValue.isEmpty) {
        return null;
      }

      return {
        fieldId: field.id,
        ...normalizedValue,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  await prisma.$transaction([
    prisma.submissionValue.deleteMany({
      where: {
        submissionId: submission.id,
      },
    }),
    ...(normalizedEntries.length > 0
      ? [
          prisma.submissionValue.createMany({
            data: normalizedEntries.map((entry) => ({
              submissionId: submission.id,
              fieldId: entry.fieldId,
              valueText: entry.valueText ?? undefined,
              valueNumber: entry.valueNumber ?? undefined,
              valueBoolean: entry.valueBoolean ?? undefined,
              valueJson: entry.valueJson ?? undefined,
            })),
          }),
        ]
      : []),
  ]);

  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/review/${submission.id}`);
  revalidatePath(`/admin/forms/assignments/${submission.assignmentId}`);

  redirect(`${parsed.returnTo || `/admin/forms/review/${submission.id}`}?saved=1`);
}

export async function syncCanonicalRegionsAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = archiveReturnToSchema.parse({
    returnTo: formData.get("returnTo"),
  });

  const result = await syncCanonicalRegionsFromHandoff();
  revalidatePath("/admin/archive");
  revalidatePath("/admin/forms");
  revalidatePath("/admin/operators");

  redirect(
    `${parsed.returnTo || "/admin/archive"}?synced=${encodeURIComponent(
      `${result.totalSubjects}|${result.reusedRegions}|${result.createdRegions}|${result.createdRegionCenters}`,
    )}`,
  );
}

export async function importHandoffArchiveRegistryAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = archiveReturnToSchema.parse({
    returnTo: formData.get("returnTo"),
  });

  const result = await importHandoffArchiveRegistry();
  revalidatePath("/admin/archive");

  redirect(
    `${parsed.returnTo || "/admin/archive"}?registryImported=${encodeURIComponent(
      `${result.totalEntries}|${result.createdFiles}|${result.updatedFiles}|${result.matchedSubjects}|${result.unmatchedSubjects}`,
    )}`,
  );
}

export async function ensureArchiveYearlyFormsAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = archiveReturnToSchema.parse({
    returnTo: formData.get("returnTo"),
  });

  const result = await ensureArchiveYearlyFormVersions();
  revalidatePath("/admin/archive");
  revalidatePath("/admin/forms");

  redirect(
    `${parsed.returnTo || "/admin/archive"}?yearlyFormsReady=${encodeURIComponent(
      `${result.targetYears}|${result.createdTemplates}|${result.createdVersions}`,
    )}`,
  );
}

export async function runArchivePilotImportAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = archivePilotImportSchema.parse({
    formCode: formData.get("formCode"),
    year: formData.get("year"),
  });

  const result = await createArchivePilotRegionSubmissions(parsed);
  revalidatePath("/admin/archive");
  revalidatePath("/admin/forms");

  redirect(
    `/admin/archive?pilotImported=${encodeURIComponent(
      `${result.formCode}|${result.year}|${result.candidateFiles}|${result.createdAssignments}|${result.createdSubmissions}|${result.skippedWithoutRegionCenter}`,
    )}`,
  );
}

export async function importArchiveRawValuesAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = archiveValueImportSchema.parse({
    formCode: formData.get("formCode"),
    year: formData.get("year"),
    limit: formData.get("limit") || undefined,
  });

  try {
    const result = await importArchiveRawValuesToStaging(parsed);
    revalidatePath("/admin/archive");

    redirect(
      `/admin/archive?valuesImported=${encodeURIComponent(
        `${parsed.formCode}|${parsed.year}|${result.selectedFiles}|${result.importedFiles}|${result.totalValues}|${result.missingSemantics}`,
      )}`,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Не удалось импортировать raw значения из handoff PostgreSQL.";
    redirect(`/admin/archive?error=${encodeURIComponent(message)}`);
  }
}

export async function applyArchiveF12MappingAction(formData: FormData) {
  await requireSuperadmin();

  const parsed = archiveMappingSchema.parse({
    year: formData.get("year"),
    limit: formData.get("limit") || undefined,
  });

  try {
    const result = await applyArchiveF12PilotMapping(parsed);
    revalidatePath("/admin/archive");
    revalidatePath("/admin/forms");

    redirect(
      `/admin/archive?mappingApplied=${encodeURIComponent(
        `${parsed.year}|${result.selectedFiles}|${result.mappedSubmissions}|${result.mappedValues}|${result.unmatchedValues}`,
      )}`,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Не удалось применить pilot mapping F12 к региональным черновикам.";
    redirect(`/admin/archive?error=${encodeURIComponent(message)}`);
  }
}

export async function createArchiveQaIssueAction(formData: FormData) {
  const currentUser = await requireSuperadmin();

  const parsed = createArchiveQaIssueSchema.safeParse({
    importFileId: formData.get("importFileId"),
    submissionId: formData.get("submissionId"),
    returnTo: formData.get("returnTo"),
    type: formData.get("type"),
    scale: formData.get("scale"),
    title: formData.get("title"),
    description: formData.get("description"),
    rawEvidence: formData.get("rawEvidence"),
    expectedResult: formData.get("expectedResult"),
    actualResult: formData.get("actualResult"),
  });

  const rawReturnTo = String(formData.get("returnTo") ?? "/admin/archive/qa");
  const returnTo =
    parsed.success && parsed.data.returnTo && parsed.data.returnTo.startsWith("/")
      ? parsed.data.returnTo
      : rawReturnTo.startsWith("/")
        ? rawReturnTo
        : "/admin/archive/qa";

  if (!parsed.success) {
    redirect(
      appendSearchParam(
        returnTo,
        `error=${encodeURIComponent(
          parsed.error.issues[0]?.message ?? "Не удалось сохранить замечание QA.",
        )}`,
      ),
    );
  }

  const importFile = await prisma.importFile.findUnique({
    where: {
      id: parsed.data.importFileId,
    },
    select: {
      id: true,
    },
  });

  if (!importFile) {
    redirect(
      appendSearchParam(returnTo, `error=${encodeURIComponent("Архивный файл не найден.")}`),
    );
  }

  let submissionId: string | null = null;
  if (parsed.data.submissionId) {
    const submission = await prisma.submission.findUnique({
      where: {
        id: parsed.data.submissionId,
      },
      select: {
        id: true,
      },
    });

    submissionId = submission?.id ?? null;
  }

  await prisma.$executeRaw`
    insert into "ArchiveQaIssue" (
      "id",
      "importFileId",
      "submissionId",
      "createdById",
      "type",
      "scale",
      "status",
      "title",
      "description",
      "rawEvidence",
      "expectedResult",
      "actualResult",
      "createdAt",
      "updatedAt"
    ) values (
      ${crypto.randomUUID()},
      ${parsed.data.importFileId},
      ${submissionId},
      ${currentUser.id},
      ${parsed.data.type}::"ArchiveQaIssueType",
      ${parsed.data.scale}::"ArchiveQaIssueScale",
      ${ArchiveQaIssueStatus.NEW}::"ArchiveQaIssueStatus",
      ${parsed.data.title},
      ${parsed.data.description},
      ${parsed.data.rawEvidence || null},
      ${parsed.data.expectedResult || null},
      ${parsed.data.actualResult || null},
      now(),
      now()
    )
  `;

  revalidatePath("/admin/archive/qa");
  redirect(
    appendSearchParam(
      returnTo,
      `issueCreated=${encodeURIComponent(`${parsed.data.type}|${parsed.data.scale}`)}`,
    ),
  );
}

export async function reviewSubmissionAction(formData: FormData) {
  const parsed = reviewSubmissionSchema.safeParse({
    submissionId: formData.get("submissionId"),
    decision: formData.get("decision"),
    reviewComment: formData.get("reviewComment"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/forms?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Не удалось обработать решение по форме.",
      )}`,
    );
  }

  const returnTo =
    parsed.data.returnTo && parsed.data.returnTo.startsWith("/")
      ? parsed.data.returnTo
      : `/admin/forms/review/${parsed.data.submissionId}`;
  const normalizedComment = parsed.data.reviewComment?.trim() || null;

  if (
    (parsed.data.decision === "request_changes" || parsed.data.decision === "reject") &&
    !normalizedComment
  ) {
    redirect(
      appendSearchParam(
        returnTo,
        `error=${encodeURIComponent("Для возврата или отклонения нужен комментарий.")}`,
      ),
    );
  }

  const { currentUser, scope, submission } = await getScopedSubmissionForReview(
    parsed.data.submissionId,
  );
  const isSuperadmin = scope.isSuperadmin;
  const nextStatusByDecision: Record<
    z.infer<typeof reviewSubmissionSchema>["decision"],
    SubmissionStatus
  > = {
    start_review: SubmissionStatus.IN_REVIEW,
    request_changes: SubmissionStatus.CHANGES_REQUESTED,
    approve_region: SubmissionStatus.APPROVED_BY_REGION,
    approve_superadmin: SubmissionStatus.APPROVED_BY_SUPERADMIN,
    reject: SubmissionStatus.REJECTED,
  };

  if (isSuperadmin && parsed.data.decision === "approve_region") {
    redirect(
      appendSearchParam(
        returnTo,
        `error=${encodeURIComponent("Федеральный уровень не может выполнить региональное согласование.")}`,
      ),
    );
  }

  if (!isSuperadmin && parsed.data.decision === "approve_superadmin") {
    redirect(
      appendSearchParam(
        returnTo,
        `error=${encodeURIComponent("Региональный администратор не может выполнить федеральное согласование.")}`,
      ),
    );
  }

  if (
    submission.status === SubmissionStatus.APPROVED_BY_SUPERADMIN &&
    parsed.data.decision !== "approve_superadmin"
  ) {
    redirect(
      appendSearchParam(
        returnTo,
        `error=${encodeURIComponent("Форма уже принята федеральным уровнем и больше не требует действий.")}`,
      ),
    );
  }

  const nextStatus = nextStatusByDecision[parsed.data.decision];

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      status: nextStatus,
      reviewComment: normalizedComment,
      reviewedAt: new Date(),
      reviewedById: currentUser.id,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/review/${submission.id}`);
  revalidatePath("/operator");
  revalidatePath(`/operator/assignments/${submission.assignmentId}`);

  redirect(appendSearchParam(returnTo, "updated=1"));
}

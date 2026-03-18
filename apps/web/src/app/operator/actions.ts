"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { SubmissionStatus } from "@/generated/prisma/client";
import { requireOperatorUser } from "@/lib/access";
import { formBuilderSchema } from "@/lib/form-builder/schema";
import {
  normalizeRuntimeValue,
  RuntimeValueMap,
  validateRuntimeValues,
} from "@/lib/form-builder/runtime";
import { prisma } from "@/lib/prisma";

const submissionPayloadSchema = z.object({
  assignmentId: z.string().min(1),
  valuesJson: z.string().min(2),
});

async function getScopedAssignment(assignmentId: string) {
  const operatorUser = await requireOperatorUser();
  const operatorOrganizationIds = operatorUser.memberships
    .filter((membership) => membership.role === "OPERATOR")
    .map((membership) => membership.organizationId);

  const assignment = await prisma.formAssignment.findFirst({
    where: {
      id: assignmentId,
      organizationId: {
        in: operatorOrganizationIds,
      },
    },
    include: {
      templateVersion: {
        include: {
          fields: true,
        },
      },
      organization: true,
      submissions: {
        where: {
          organizationId: {
            in: operatorOrganizationIds,
          },
        },
        include: {
          values: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 1,
      },
    },
  });

  if (!assignment) {
    redirect("/operator?error=assignment_not_found");
  }

  return {
    assignment,
    operatorUser,
    operatorOrganizationId: assignment.organizationId,
  };
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

async function persistSubmission(params: {
  assignmentId: string;
  values: RuntimeValueMap;
  status: SubmissionStatus;
  submittedById?: string | null;
}) {
  const { assignment, operatorOrganizationId } = await getScopedAssignment(params.assignmentId);
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
      organizationId: operatorOrganizationId,
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
              ? params.submittedById ?? null
              : undefined,
          submittedAt: params.status === SubmissionStatus.SUBMITTED ? new Date() : null,
        },
      })
    : await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          organizationId: operatorOrganizationId,
          status: params.status,
          submittedById:
            params.status === SubmissionStatus.SUBMITTED
              ? params.submittedById ?? null
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

export async function saveOperatorSubmissionDraftAction(formData: FormData) {
  const parsed = submissionPayloadSchema.parse({
    assignmentId: formData.get("assignmentId"),
    valuesJson: formData.get("valuesJson"),
  });

  const values = parseRuntimeValues(parsed.valuesJson);

  await persistSubmission({
    assignmentId: parsed.assignmentId,
    values,
    status: SubmissionStatus.DRAFT,
  });

  redirect(`/operator/assignments/${parsed.assignmentId}?saved=1`);
}

export async function submitOperatorSubmissionAction(formData: FormData) {
  const parsed = submissionPayloadSchema.parse({
    assignmentId: formData.get("assignmentId"),
    valuesJson: formData.get("valuesJson"),
  });

  const { operatorUser, assignment } = await getScopedAssignment(parsed.assignmentId);
  const schema = formBuilderSchema.parse(assignment.templateVersion.schemaJson);
  const values = parseRuntimeValues(parsed.valuesJson);
  const validationErrors = validateRuntimeValues(schema, values);

  if (Object.keys(validationErrors).length > 0) {
    redirect(
      `/operator/assignments/${parsed.assignmentId}?error=${encodeURIComponent(
        "Заполните обязательные поля и исправьте ошибки в форме.",
      )}`,
    );
  }

  await persistSubmission({
    assignmentId: parsed.assignmentId,
    values,
    status: SubmissionStatus.SUBMITTED,
    submittedById: operatorUser.id,
  });

  redirect(`/operator/assignments/${parsed.assignmentId}?submitted=1`);
}

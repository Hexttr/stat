import { notFound } from "next/navigation";

import {
  publishFormVersionAction,
  saveFormVersionDraftAction,
} from "@/app/admin/actions";
import { FormTemplateVersionStatus } from "@/generated/prisma/client";
import { requireSuperadmin } from "@/lib/access";
import { formBuilderSchema } from "@/lib/form-builder/schema";
import { prisma } from "@/lib/prisma";

import { FormBuilderEditor } from "./form-builder-editor";

export default async function FormBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperadmin();

  const { versionId } = await params;
  const resolvedSearchParams =
    (await searchParams) ?? ({} as Record<string, string | string[] | undefined>);

  const version = await prisma.formTemplateVersion.findUnique({
    where: { id: versionId },
    include: {
      template: {
        include: {
          formType: true,
        },
      },
      reportingYear: true,
      publishedBy: true,
    },
  });

  if (!version) {
    notFound();
  }

  const parsedSchema = formBuilderSchema.parse(version.schemaJson);
  const saved = resolvedSearchParams.saved === "1";
  const published = resolvedSearchParams.published === "1";
  const error =
    typeof resolvedSearchParams.error === "string"
      ? decodeURIComponent(resolvedSearchParams.error)
      : null;

  return (
    <FormBuilderEditor
      versionId={version.id}
      formCode={version.template.formType.code}
      templateName={version.template.name}
      initialTitle={version.title}
      reportingYear={version.reportingYear.year}
      versionNumber={version.version}
      versionStatus={version.versionStatus as FormTemplateVersionStatus}
      initialSchema={parsedSchema}
      saved={saved}
      published={published}
      error={error}
      publishedMeta={
        version.publishedAt
          ? {
              fullName: version.publishedBy?.fullName ?? "Неизвестно",
              publishedAt: version.publishedAt.toISOString(),
            }
          : null
      }
      saveAction={saveFormVersionDraftAction}
      publishAction={publishFormVersionAction}
    />
  );
}

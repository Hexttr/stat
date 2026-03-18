import { notFound } from "next/navigation";

import {
  publishFormVersionAction,
  saveFormVersionDraftAction,
} from "@/app/admin/actions";
import { FormTemplateVersionStatus } from "@/generated/prisma/client";
import { requireSuperadmin } from "@/lib/access";
import { formBuilderSchema } from "@/lib/form-builder/schema";
import { prisma } from "@/lib/prisma";

import { FormBuilderWorkspace } from "./form-builder-workspace";

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
  const importedRaw =
    typeof resolvedSearchParams.imported === "string"
      ? decodeURIComponent(resolvedSearchParams.imported)
      : null;
  const imported = importedRaw ? importedRaw.split("|") : null;
  const warning =
    typeof resolvedSearchParams.warning === "string"
      ? decodeURIComponent(resolvedSearchParams.warning)
      : null;

  return (
    <FormBuilderWorkspace
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
      importNotice={
        imported
          ? `Импорт выполнен по файлу ${imported[0]}. Найдено таблиц: ${imported[1]}, строк: ${imported[2]}, файлов в архиве: ${imported[3]}.`
          : null
      }
      warning={warning}
      publishedMeta={
        version.publishedAt
          ? {
              fullName: version.publishedBy?.fullName ?? "Неизвестно",
              publishedAtLabel: version.publishedAt.toLocaleString("ru-RU"),
            }
          : null
      }
      saveAction={saveFormVersionDraftAction}
      publishAction={publishFormVersionAction}
    />
  );
}

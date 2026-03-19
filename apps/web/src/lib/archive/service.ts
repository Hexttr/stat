import { createHash } from "node:crypto";
import path from "node:path";

import {
  FormAssignmentStatus,
  FormTemplateVersionStatus,
  ImportFileStatus,
  OrganizationType,
  SubmissionStatus,
} from "@/generated/prisma/client";
import { projectSchemaToFields } from "@/lib/form-builder/projection";
import {
  createDefaultFormSchema,
  duplicateFormSchema,
  formBuilderSchema,
} from "@/lib/form-builder/schema";
import { prisma } from "@/lib/prisma";
import { fetchHandoffValuesBySourceDocs } from "./handoff-db";

import {
  getCanonicalRegionPayload,
  loadHandoffDocScopeEntries,
  loadHandoffScopeEntities,
  loadHandoffSubjects,
  normalizeCanonText,
} from "./handoff";

export const HANDOFF_BATCH_NAME = "handoff-doc-scope-canon";

function createImportFileId(sourceDoc: string) {
  return `handoff_${createHash("sha1").update(sourceDoc).digest("hex")}`;
}

function getRegionMatchMap(
  regions: Array<{ id: string; code: string; fullName: string; shortName: string }>,
) {
  const map = new Map<
    string,
    { id: string; code: string; fullName: string; shortName: string }
  >();

  for (const region of regions) {
    map.set(normalizeCanonText(region.fullName), region);
    map.set(normalizeCanonText(region.shortName), region);
  }

  return map;
}

function getRegionCenterName(regionFullName: string) {
  return `${regionFullName} — региональный центр`;
}

function parseNumberValue(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  const normalized = rawValue.replace(/\s+/g, "").replace(",", ".");

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildRawLabel(params: {
  tableTitle: string | null;
  rowNo: string | null;
  rowLabel: string | null;
  colNo: string | null;
  colLabel: string | null;
}) {
  const rowPart = [params.rowNo, params.rowLabel].filter(Boolean).join(" ");
  const colPart = [params.colNo, params.colLabel].filter(Boolean).join(" ");

  return [params.tableTitle, rowPart, colPart].filter(Boolean).join(" / ") || null;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function normalizeArchiveText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[–—−]/g, "-")
    .replace(/[«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getArchiveTableId(tableCode: string | null | undefined) {
  const parsed = Number(tableCode);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  const index = parsed / 1000;
  return Number.isInteger(index) ? `table_${index}` : null;
}

function getFieldLabelParts(label: string) {
  const separator = " / ";
  const separatorIndex = label.lastIndexOf(separator);

  if (separatorIndex === -1) {
    return {
      rowLabel: label,
      columnLabel: "",
    };
  }

  return {
    rowLabel: label.slice(0, separatorIndex),
    columnLabel: label.slice(separatorIndex + separator.length),
  };
}

function extractDiagnosisCode(value: string | null | undefined) {
  const match = (value ?? "").match(/[A-Z]\d{2}(?:\.\d+)?(?:-[A-Z]?\d{2}(?:\.\d+)?)?/);
  return match?.[0] ?? null;
}

function columnLabelsMatch(params: {
  fieldColumnLabel: string;
  rawColumnLabel: string | null;
  rawColumnNumber: string | null;
}) {
  const fieldColumn = normalizeArchiveText(params.fieldColumnLabel);
  const rawColumn = normalizeArchiveText(params.rawColumnLabel);
  const rawColumnNo = normalizeArchiveText(params.rawColumnNumber);

  if (fieldColumn && rawColumn && fieldColumn === rawColumn) {
    return true;
  }

  if (rawColumnNo && fieldColumn === `графа ${rawColumnNo}`) {
    return true;
  }

  if (rawColumnNo && fieldColumn === rawColumnNo) {
    return true;
  }

  if (fieldColumn.includes("код") && rawColumnNo === "4") {
    return true;
  }

  return false;
}

function rowLabelsMatch(params: {
  fieldRowLabel: string;
  rawRowLabel: string | null;
}) {
  const fieldRow = normalizeArchiveText(params.fieldRowLabel);
  const rawRow = normalizeArchiveText(params.rawRowLabel);

  if (!fieldRow || !rawRow) {
    return false;
  }

  if (fieldRow === rawRow || fieldRow.includes(rawRow) || rawRow.includes(fieldRow)) {
    return true;
  }

  const rawCode = extractDiagnosisCode(params.rawRowLabel);
  if (rawCode && fieldRow.includes(normalizeArchiveText(rawCode))) {
    return true;
  }

  return false;
}

export async function syncCanonicalRegionsFromHandoff() {
  const [subjects, existingRegions] = await Promise.all([
    loadHandoffSubjects(),
    prisma.region.findMany({
      orderBy: { fullName: "asc" },
    }),
  ]);

  const regionMatchMap = getRegionMatchMap(existingRegions);
  let createdRegions = 0;
  let updatedRegions = 0;
  let reusedRegions = 0;
  let createdRegionCenters = 0;

  for (const subject of subjects) {
    const payload = getCanonicalRegionPayload(subject);
    const matchedRegion = regionMatchMap.get(payload.matchKey) ?? null;
    const regionCode = matchedRegion?.code ?? payload.code;

    const upsertedRegion = await prisma.region.upsert({
      where: { code: regionCode },
      update: {
        shortName: matchedRegion?.shortName ?? payload.shortName,
        fullName: payload.fullName,
      },
      create: {
        code: regionCode,
        shortName: matchedRegion?.shortName ?? payload.shortName,
        fullName: payload.fullName,
      },
    });

    if (matchedRegion) {
      reusedRegions += 1;

      if (
        matchedRegion.fullName !== payload.fullName ||
        matchedRegion.shortName !== (matchedRegion.shortName ?? payload.shortName)
      ) {
        updatedRegions += 1;
      }
    } else {
      createdRegions += 1;
    }

    const existingCenter = await prisma.organization.findFirst({
      where: {
        regionId: upsertedRegion.id,
        type: OrganizationType.REGION_CENTER,
      },
      select: {
        id: true,
      },
    });

    if (!existingCenter) {
      await prisma.organization.create({
        data: {
          regionId: upsertedRegion.id,
          type: OrganizationType.REGION_CENTER,
          name: getRegionCenterName(upsertedRegion.fullName),
        },
      });
      createdRegionCenters += 1;
    }
  }

  return {
    totalSubjects: subjects.length,
    reusedRegions,
    createdRegions,
    updatedRegions,
    createdRegionCenters,
  };
}

export async function importHandoffArchiveRegistry() {
  const [entries, scopeEntities, regions, formTypes] = await Promise.all([
    loadHandoffDocScopeEntries(),
    loadHandoffScopeEntities(),
    prisma.region.findMany({
      select: {
        id: true,
        code: true,
        fullName: true,
        shortName: true,
      },
    }),
    prisma.formType.findMany({
      select: {
        id: true,
        code: true,
      },
    }),
  ]);

  const years = Array.from(new Set(entries.map((entry) => entry.year))).sort();
  const regionMatchMap = getRegionMatchMap(regions);
  const formTypeByCode = new Map(formTypes.map((formType) => [formType.code, formType]));
  const scopeByCompositeKey = new Map(
    scopeEntities.map((scope) => [`${scope.scopeType}:${scope.scopeKey}`, scope]),
  );

  for (const year of years) {
    await prisma.reportingYear.upsert({
      where: { year },
      update: {},
      create: {
        year,
        isOpenForInput: false,
        isPublished: false,
      },
    });
  }

  const reportingYears = await prisma.reportingYear.findMany({
    where: {
      year: {
        in: years,
      },
    },
    select: {
      id: true,
      year: true,
    },
  });
  const reportingYearByYear = new Map(reportingYears.map((year) => [year.year, year]));

  const batch = await prisma.importBatch.upsert({
    where: {
      id: HANDOFF_BATCH_NAME,
    },
    update: {
      sourceLabel: "v_doc_scope_canon.csv",
      notes: "Нормализованный реестр handoff-документов по субъектам и scope.",
    },
    create: {
      id: HANDOFF_BATCH_NAME,
      name: HANDOFF_BATCH_NAME,
      sourceLabel: "v_doc_scope_canon.csv",
      notes: "Нормализованный реестр handoff-документов по субъектам и scope.",
    },
  });

  let createdFiles = 0;
  let updatedFiles = 0;
  let matchedSubjects = 0;
  let unmatchedSubjects = 0;
  let scopeEntriesImported = 0;

  for (const entry of entries) {
    const normalizedRegionName = normalizeCanonText(entry.subjectNameCanon);
    const matchedRegion =
      entry.resolvedKind === "SUBJECT" && normalizedRegionName
        ? regionMatchMap.get(normalizedRegionName) ?? null
        : null;

    if (entry.resolvedKind === "SUBJECT") {
      if (matchedRegion) {
        matchedSubjects += 1;
      } else {
        unmatchedSubjects += 1;
      }
    } else {
      scopeEntriesImported += 1;
    }

    const scopeEntity =
      entry.scopeType && entry.scopeKey
        ? scopeByCompositeKey.get(`${entry.scopeType}:${entry.scopeKey}`) ?? null
        : null;
    const formType = formTypeByCode.get(entry.form) ?? null;
    const fileId = createImportFileId(entry.sourceDoc);
    const originalName = path.basename(entry.sourceDoc);
    const existing = await prisma.importFile.findUnique({
      where: { id: fileId },
      select: { id: true },
    });

    await prisma.importFile.upsert({
      where: { id: fileId },
      update: {
        batchId: batch.id,
        formTypeId: formType?.id ?? null,
        regionId: matchedRegion?.id ?? null,
        reportingYearId: reportingYearByYear.get(entry.year)?.id ?? null,
        originalName,
        storagePath: entry.sourceDoc,
        fileExtension: path.extname(entry.sourceDoc) || ".doc",
        status: ImportFileStatus.CLASSIFIED,
        detectedMetadata: {
          handoff: {
            source: "v_doc_scope_canon",
            resolvedKind: entry.resolvedKind,
            sourceDoc: entry.sourceDoc,
            subjectAlias: entry.subjectAlias,
            subjectOktmoKey: entry.subjectOktmoKey,
            subjectNameCanon: entry.subjectNameCanon,
            scopeType: entry.scopeType,
            scopeKey: entry.scopeKey,
            scopeNameCanon: entry.scopeNameCanon,
            scopeCode4: scopeEntity?.code4 ?? entry.code4,
            code4: entry.code4,
            code5: entry.code5,
            resolverVersion: entry.resolverVersion,
            updatedAt: entry.updatedAt,
            matchedRegionCode: matchedRegion?.code ?? null,
            matchedRegionName: matchedRegion?.fullName ?? null,
          },
        },
      },
      create: {
        id: fileId,
        batchId: batch.id,
        formTypeId: formType?.id ?? null,
        regionId: matchedRegion?.id ?? null,
        reportingYearId: reportingYearByYear.get(entry.year)?.id ?? null,
        originalName,
        storagePath: entry.sourceDoc,
        fileExtension: path.extname(entry.sourceDoc) || ".doc",
        status: ImportFileStatus.CLASSIFIED,
        detectedMetadata: {
          handoff: {
            source: "v_doc_scope_canon",
            resolvedKind: entry.resolvedKind,
            sourceDoc: entry.sourceDoc,
            subjectAlias: entry.subjectAlias,
            subjectOktmoKey: entry.subjectOktmoKey,
            subjectNameCanon: entry.subjectNameCanon,
            scopeType: entry.scopeType,
            scopeKey: entry.scopeKey,
            scopeNameCanon: entry.scopeNameCanon,
            scopeCode4: scopeEntity?.code4 ?? entry.code4,
            code4: entry.code4,
            code5: entry.code5,
            resolverVersion: entry.resolverVersion,
            updatedAt: entry.updatedAt,
            matchedRegionCode: matchedRegion?.code ?? null,
            matchedRegionName: matchedRegion?.fullName ?? null,
          },
        },
      },
    });

    if (existing) {
      updatedFiles += 1;
    } else {
      createdFiles += 1;
    }
  }

  return {
    totalEntries: entries.length,
    createdFiles,
    updatedFiles,
    matchedSubjects,
    unmatchedSubjects,
    scopeEntriesImported,
  };
}

export async function ensureArchiveYearlyFormVersions() {
  const targetYears = [2019, 2020, 2021, 2022, 2023, 2024];

  for (const year of targetYears) {
    await prisma.reportingYear.upsert({
      where: { year },
      update: {},
      create: {
        year,
        isOpenForInput: false,
        isPublished: false,
      },
    });
  }

  const [reportingYears, formTypes] = await Promise.all([
    prisma.reportingYear.findMany({
      where: {
        year: {
          in: targetYears,
        },
      },
    }),
    prisma.formType.findMany({
      include: {
        templates: {
          include: {
            versions: {
              include: {
                reportingYear: true,
              },
              orderBy: [
                {
                  reportingYear: {
                    year: "desc",
                  },
                },
                {
                  version: "desc",
                },
              ],
            },
          },
        },
      },
      orderBy: {
        code: "asc",
      },
    }),
  ]);

  let createdYears = 0;
  let createdVersions = 0;
  let createdTemplates = 0;

  for (const year of targetYears) {
    if (reportingYears.some((item) => item.year === year)) {
      continue;
    }

    createdYears += 1;
  }

  for (const formType of formTypes) {
    const existingTemplate = formType.templates[0];
    const template =
      existingTemplate ??
      (await prisma.formTemplate.create({
        data: {
          id: `${formType.code.toLowerCase()}-template`,
          formTypeId: formType.id,
          name: `${formType.name} — базовый шаблон`,
          description: `Архивный базовый шаблон для ${formType.name}.`,
        },
      }));

    if (!existingTemplate) {
      createdTemplates += 1;
    }

    const templateWithVersions =
      existingTemplate ??
      ({
        ...template,
        versions: [],
      } as typeof existingTemplate);

    const baseVersion =
      templateWithVersions.versions.find((version) => version.reportingYear.year === 2024) ??
      templateWithVersions.versions[0] ??
      null;

    for (const reportingYear of reportingYears) {
      const existingVersion = templateWithVersions.versions.find(
        (version) => version.reportingYearId === reportingYear.id,
      );

      if (existingVersion) {
        continue;
      }

      const title = `${formType.name} за ${reportingYear.year}`;
      const schema = baseVersion
        ? duplicateFormSchema(formBuilderSchema.parse(baseVersion.schemaJson), {
            title,
            reportingYear: reportingYear.year,
          })
        : createDefaultFormSchema({
            formCode: formType.code,
            title,
            reportingYear: reportingYear.year,
            description: `Архивная версия ${formType.name} за ${reportingYear.year}.`,
          });

      const createdVersion = await prisma.formTemplateVersion.create({
        data: {
          templateId: template.id,
          reportingYearId: reportingYear.id,
          version: 1,
          title,
          versionStatus: FormTemplateVersionStatus.DRAFT,
          schemaJson: schema,
        },
      });

      const fields = projectSchemaToFields(schema);
      if (fields.length > 0) {
        await prisma.formField.createMany({
          data: fields.map((field) => ({
            templateVersionId: createdVersion.id,
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
          })),
        });
      }

      createdVersions += 1;
    }
  }

  return {
    targetYears: targetYears.length,
    createdYears,
    createdTemplates,
    createdVersions,
  };
}

export async function createArchivePilotRegionSubmissions(params: {
  formCode: string;
  year: number;
}) {
  const [formType, reportingYear, regionFiles, version] = await Promise.all([
    prisma.formType.findUnique({
      where: { code: params.formCode },
    }),
    prisma.reportingYear.findUnique({
      where: { year: params.year },
    }),
    prisma.importFile.findMany({
      where: {
        batchId: HANDOFF_BATCH_NAME,
        regionId: {
          not: null,
        },
        reportingYear: {
          year: params.year,
        },
        formType: {
          code: params.formCode,
        },
      },
      include: {
        region: true,
      },
      orderBy: {
        storagePath: "asc",
      },
    }),
    prisma.formTemplateVersion.findFirst({
      where: {
        reportingYear: {
          year: params.year,
        },
        template: {
          formType: {
            code: params.formCode,
          },
        },
      },
      include: {
        template: {
          include: {
            formType: true,
          },
        },
        reportingYear: true,
      },
      orderBy: {
        version: "desc",
      },
    }),
  ]);

  if (!formType || !reportingYear || !version) {
    throw new Error("Для пилота не найдены форма, год или версия шаблона.");
  }

  const regionIds = regionFiles
    .map((file) => file.regionId)
    .filter((regionId): regionId is string => Boolean(regionId));

  const regionCenters = await prisma.organization.findMany({
    where: {
      type: OrganizationType.REGION_CENTER,
      regionId: {
        in: regionIds,
      },
    },
    include: {
      region: true,
    },
  });
  const regionCenterByRegionId = new Map(
    regionCenters.map((organization) => [organization.regionId, organization]),
  );

  let createdAssignments = 0;
  let createdSubmissions = 0;
  let skippedWithoutRegionCenter = 0;

  for (const file of regionFiles) {
    if (!file.regionId) {
      continue;
    }

    const regionCenter = regionCenterByRegionId.get(file.regionId);
    if (!regionCenter) {
      skippedWithoutRegionCenter += 1;
      continue;
    }

    const assignment = await prisma.formAssignment.upsert({
      where: {
        templateVersionId_reportingYearId_regionId_organizationId: {
          templateVersionId: version.id,
          reportingYearId: reportingYear.id,
          regionId: file.regionId,
          organizationId: regionCenter.id,
        },
      },
      update: {
        status: FormAssignmentStatus.PUBLISHED,
      },
      create: {
        templateVersionId: version.id,
        reportingYearId: reportingYear.id,
        regionId: file.regionId,
        organizationId: regionCenter.id,
        status: FormAssignmentStatus.PUBLISHED,
      },
    });

    const existingSubmission = await prisma.submission.findFirst({
      where: {
        assignmentId: assignment.id,
        organizationId: regionCenter.id,
      },
    });

    if (!existingSubmission) {
      await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          organizationId: regionCenter.id,
          status: SubmissionStatus.DRAFT,
          reviewComment:
            `Архивная заготовка создана из handoff-реестра. Исходный документ: ${file.storagePath}. ` +
            "Значения пока не перенесены автоматически и могут быть заполнены регионом вручную.",
        },
      });
      createdSubmissions += 1;
    }

    if (assignment.createdAt.getTime() === assignment.updatedAt.getTime()) {
      createdAssignments += 1;
    }
  }

  return {
    formCode: params.formCode,
    year: params.year,
    candidateFiles: regionFiles.length,
    createdAssignments,
    createdSubmissions,
    skippedWithoutRegionCenter,
  };
}

export async function importArchiveRawValuesToStaging(params?: {
  formCode?: string;
  year?: number;
  limit?: number;
}) {
  const files = await prisma.importFile.findMany({
    where: {
      batchId: HANDOFF_BATCH_NAME,
      ...(params?.formCode
        ? {
            formType: {
              code: params.formCode,
            },
          }
        : {}),
      ...(params?.year
        ? {
            reportingYear: {
              year: params.year,
            },
          }
        : {}),
    },
    orderBy: [
      {
        reportingYear: {
          year: "asc",
        },
      },
      {
        storagePath: "asc",
      },
    ],
    take: params?.limit ?? undefined,
  });

  if (files.length === 0) {
    return {
      selectedFiles: 0,
      importedFiles: 0,
      totalValues: 0,
      missingSemantics: 0,
    };
  }

  let importedFiles = 0;
  let totalValues = 0;
  let missingSemantics = 0;

  for (const fileChunk of chunkArray(files, 1)) {
    const rawRows = await fetchHandoffValuesBySourceDocs(
      fileChunk.map((file) => file.storagePath),
    );
    const rowsBySourceDoc = new Map<string, typeof rawRows>();

    for (const row of rawRows) {
      const bucket = rowsBySourceDoc.get(row.source_doc) ?? [];
      bucket.push(row);
      rowsBySourceDoc.set(row.source_doc, bucket);
    }

    for (const file of fileChunk) {
      const rows = rowsBySourceDoc.get(file.storagePath) ?? [];
      const values = rows.map((row) => ({
        rawKey: row.xml_tag,
        rawLabel: buildRawLabel({
          tableTitle: row.table_title,
          rowNo: row.row_no,
          rowLabel: row.row_label,
          colNo: row.col_no,
          colLabel: row.col_label,
        }),
        normalizedKey: row.xml_tag,
        valueText: row.value_raw,
        valueNumber: parseNumberValue(row.value_raw),
        confidence: row.table_title || row.row_label || row.col_label ? 0.95 : 0.5,
        contextJson: {
          source: "stg_values",
          form: row.form,
          year: row.year,
          xmlTag: row.xml_tag,
          tableCode: row.table_code,
          tableTitle: row.table_title,
          rowNo: row.row_no,
          rowLabel: row.row_label,
          colNo: row.col_no,
          colLabel: row.col_label,
        },
      }));

      const currentMissingSemantics = rows.filter(
        (row) => !row.table_title && !row.row_label && !row.col_label,
      ).length;
      missingSemantics += currentMissingSemantics;
      const valueChunks = chunkArray(values, 5000);

      await prisma.$transaction(
        async (tx) => {
          await tx.importFieldValue.deleteMany({
            where: {
              importFileId: file.id,
            },
          });
          await tx.importIssue.deleteMany({
            where: {
              importFileId: file.id,
              code: {
                in: ["HANDOFF_VALUE_IMPORT_NO_SEMANTICS", "HANDOFF_VALUE_IMPORT_EMPTY"],
              },
            },
          });

          for (const valueChunk of valueChunks) {
            if (valueChunk.length === 0) {
              continue;
            }

            await tx.importFieldValue.createMany({
              data: valueChunk.map((value) => ({
                importFileId: file.id,
                rawKey: value.rawKey,
                rawLabel: value.rawLabel ?? undefined,
                normalizedKey: value.normalizedKey,
                valueText: value.valueText ?? undefined,
                valueNumber: value.valueNumber ?? undefined,
                confidence: value.confidence,
                contextJson: value.contextJson,
              })),
            });
          }

          await tx.importFile.update({
            where: {
              id: file.id,
            },
            data: {
              status: ImportFileStatus.EXTRACTED,
              extractedPayload: {
                source: "stg_values",
                importedAt: new Date().toISOString(),
                totalValues: values.length,
                missingSemantics: currentMissingSemantics,
              },
            },
          });

          if (currentMissingSemantics > 0) {
            await tx.importIssue.create({
              data: {
                importFileId: file.id,
                code: "HANDOFF_VALUE_IMPORT_NO_SEMANTICS",
                message:
                  "Часть xml_tag загружена без semantic passport и сохранена только с rawKey/rawValue.",
                severity: "WARNING",
                detailsJson: {
                  count: currentMissingSemantics,
                },
              },
            });
          }

          if (values.length === 0) {
            await tx.importIssue.create({
              data: {
                importFileId: file.id,
                code: "HANDOFF_VALUE_IMPORT_EMPTY",
                message: "Для source_doc не найдено строк в statforms.stg_values.",
                severity: "WARNING",
                detailsJson: {
                  sourceDoc: file.storagePath,
                },
              },
            });
          }
        },
        {
          timeout: 60_000,
        },
      );

      importedFiles += 1;
      totalValues += values.length;
    }
  }

  return {
    selectedFiles: files.length,
    importedFiles,
    totalValues,
    missingSemantics,
  };
}

export async function applyArchiveF12PilotMapping(params?: {
  year?: number;
  limit?: number;
}) {
  const targetYear = params?.year ?? 2024;
  const extractedFiles = await prisma.importFile.findMany({
    where: {
      batchId: HANDOFF_BATCH_NAME,
      status: ImportFileStatus.EXTRACTED,
      regionId: {
        not: null,
      },
      formType: {
        code: "F12",
      },
      reportingYear: {
        year: targetYear,
      },
    },
    include: {
      region: true,
      reportingYear: true,
      formType: true,
      fieldValues: true,
    },
    orderBy: {
      storagePath: "asc",
    },
    take: params?.limit ?? undefined,
  });

  if (extractedFiles.length === 0) {
    return {
      selectedFiles: 0,
      mappedSubmissions: 0,
      mappedValues: 0,
      unmatchedValues: 0,
    };
  }

  const assignments = await prisma.formAssignment.findMany({
    where: {
      regionId: {
        in: extractedFiles
          .map((file) => file.regionId)
          .filter((regionId): regionId is string => Boolean(regionId)),
      },
      organization: {
        type: OrganizationType.REGION_CENTER,
      },
      templateVersion: {
        template: {
          formType: {
            code: "F12",
          },
        },
      },
      reportingYear: {
        year: targetYear,
      },
    },
    include: {
      templateVersion: {
        include: {
          fields: true,
        },
      },
      submissions: {
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

  const assignmentByRegionId = new Map(
    assignments.map((assignment) => [assignment.regionId, assignment]),
  );

  let mappedSubmissions = 0;
  let mappedValues = 0;
  let unmatchedValues = 0;

  for (const file of extractedFiles) {
    if (!file.regionId) {
      continue;
    }

    const assignment = assignmentByRegionId.get(file.regionId);
    const submission = assignment?.submissions[0] ?? null;
    if (!assignment || !submission) {
      continue;
    }

    const tableFields = assignment.templateVersion.fields.filter((field) => field.tableId);
    const matchedEntries = new Map<
      string,
      {
        fieldId: string;
        valueText: string | null;
        valueNumber: number | null;
        contextJson: unknown;
      }
    >();
    let fileUnmatched = 0;

    for (const fieldValue of file.fieldValues) {
      const context = (fieldValue.contextJson ?? {}) as {
        tableCode?: string | null;
        rowLabel?: string | null;
        colLabel?: string | null;
        colNo?: string | null;
      };
      const tableId = getArchiveTableId(context.tableCode);

      if (!tableId) {
        fileUnmatched += 1;
        continue;
      }

      const candidates = tableFields.filter((field) => {
        if (field.tableId !== tableId) {
          return false;
        }

        const { rowLabel, columnLabel } = getFieldLabelParts(field.label);
        return (
          columnLabelsMatch({
            fieldColumnLabel: columnLabel,
            rawColumnLabel: context.colLabel ?? null,
            rawColumnNumber: context.colNo ?? null,
          }) &&
          rowLabelsMatch({
            fieldRowLabel: rowLabel,
            rawRowLabel: context.rowLabel ?? null,
          })
        );
      });

      if (candidates.length !== 1) {
        fileUnmatched += 1;
        continue;
      }

      matchedEntries.set(candidates[0].id, {
        fieldId: candidates[0].id,
        valueText: fieldValue.valueText ?? null,
        valueNumber:
          typeof fieldValue.valueNumber === "object" && fieldValue.valueNumber !== null
            ? Number(fieldValue.valueNumber)
            : (fieldValue.valueNumber as number | null),
        contextJson: fieldValue.contextJson,
      });
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.submissionValue.deleteMany({
          where: {
            submissionId: submission.id,
          },
        });

        const values = Array.from(matchedEntries.values());
        for (const valueChunk of chunkArray(values, 1000)) {
          if (valueChunk.length === 0) {
            continue;
          }

          await tx.submissionValue.createMany({
            data: valueChunk.map((entry) => ({
              submissionId: submission.id,
              fieldId: entry.fieldId,
              valueText: entry.valueText ?? undefined,
              valueNumber: entry.valueNumber ?? undefined,
              valueJson: {
                archiveMapping: {
                  strategy: "f12-pilot-table-row-col",
                  importedAt: new Date().toISOString(),
                  sourceImportFileId: file.id,
                  sourceDoc: file.storagePath,
                    contextText: JSON.stringify(entry.contextJson ?? null),
                },
              },
            })),
          });
        }

        await tx.submission.update({
          where: {
            id: submission.id,
          },
          data: {
            reviewComment:
              `Пилотный auto-mapping F12: ${matchedEntries.size} значений сопоставлено, ` +
              `${fileUnmatched} значений требуют ручной проверки. Источник: ${file.storagePath}`,
          },
        });
      },
      {
        timeout: 60_000,
      },
    );

    mappedSubmissions += 1;
    mappedValues += matchedEntries.size;
    unmatchedValues += fileUnmatched;
  }

  return {
    selectedFiles: extractedFiles.length,
    mappedSubmissions,
    mappedValues,
    unmatchedValues,
  };
}

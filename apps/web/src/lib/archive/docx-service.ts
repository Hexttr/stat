import { createHash } from "node:crypto";
import path from "node:path";

import { ImportFileStatus, ImportIssueSeverity } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeCanonText } from "./handoff";
import {
  CANONICAL_DOCX_BATCH_NAME,
  extractCanonicalDocxRows,
  scanCanonicalDocxArchive,
} from "./docx";

type RegionLookupRecord = {
  id: string;
  code: string;
  subjectOktmoKey: string | null;
  fullName: string;
  shortName: string;
};

function createDocxImportFileId(sourceDoc: string) {
  return `docx_${createHash("sha1").update(sourceDoc).digest("hex")}`;
}

function getRegionLookup(regions: RegionLookupRecord[]) {
  const byName = new Map<string, RegionLookupRecord>();

  for (const region of regions) {
    for (const alias of createRegionAliasKeys(region.fullName)) {
      byName.set(alias, region);
    }
    for (const alias of createRegionAliasKeys(region.shortName)) {
      byName.set(alias, region);
    }
  }

  return {
    byName,
  };
}

function createRegionAliasKeys(value: string | null | undefined) {
  const aliases = new Set<string>();

  const candidates = [
    normalizeRegionAliasSource(value ?? ""),
    normalizeRegionAliasSource((value ?? "").replace(/_/g, " ")),
    normalizeRegionAliasSource((value ?? "").replace(/-/g, " ")),
    normalizeRegionAliasSource((value ?? "").replace(/[-_]+/g, " ")),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCanonText(candidate);
    if (!normalized) {
      continue;
    }

    aliases.add(normalized);

    const stripped = normalized
      .replace(/\bБЕЗ АО\b/g, " ")
      .replace(/\bБЕЗ\b/g, " ")
      .replace(/\bРЕСПУБЛИКА\b/g, " ")
      .replace(/\bГОРОД ФЕДЕРАЛЬНОГО ЗНАЧЕНИЯ\b/g, " ")
      .replace(/\bГОРОД\b/g, " ")
      .replace(/\bФЕДЕРАЛЬНАЯ ТЕРРИТОРИЯ\b/g, " ")
      .replace(/\bАВТОНОМНЫЙ ОКРУГ\b/g, " ")
      .replace(/\bАВТОНОМНАЯ ОБЛАСТЬ\b/g, " ")
      .replace(/\bОБЛАСТЬ\b/g, " ")
      .replace(/\bКРАЙ\b/g, " ")
      .replace(/\bАО\b/g, " ")
      .replace(/\bФО\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (stripped) {
      aliases.add(stripped);
    }
  }

  return aliases;
}

function normalizeRegionAliasSource(value: string) {
  return value
    .toUpperCase()
    .replace(/[A]/g, "А")
    .replace(/[B]/g, "В")
    .replace(/[C]/g, "С")
    .replace(/[E]/g, "Е")
    .replace(/[H]/g, "Н")
    .replace(/[K]/g, "К")
    .replace(/[M]/g, "М")
    .replace(/[O]/g, "О")
    .replace(/[P]/g, "Р")
    .replace(/[T]/g, "Т")
    .replace(/[X]/g, "Х")
    .replace(/РЕСП\./g, "РЕСПУБЛИКА ")
    .replace(/ОБЛ\./g, "ОБЛАСТЬ ")
    .replace(/ФЕД\.?\s*ОКР/g, "ФЕДЕРАЛЬНЫЙ ОКРУГ")
    .replace(/АВТ\.?\s*ОКР/g, "АВТОНОМНЫЙ ОКРУГ")
    .replace(/\bАО\b/g, "АВТОНОМНЫЙ ОКРУГ")
    .replace(/\bОБЛ\b/g, "ОБЛАСТЬ")
    .replace(/\bРЕСП\b/g, "РЕСПУБЛИКА")
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCanonicalRegionByName(
  lookup: ReturnType<typeof getRegionLookup>,
  canonicalName: string | null | undefined,
) {
  for (const alias of createRegionAliasKeys(canonicalName)) {
    const matchedRegion = lookup.byName.get(alias);
    if (matchedRegion) {
      return matchedRegion;
    }
  }

  return null;
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

export async function importCanonicalDocxArchiveRegistry() {
  const [entries, regions, formTypes] = await Promise.all([
    scanCanonicalDocxArchive(),
    prisma.region.findMany({
      select: {
        id: true,
        code: true,
        subjectOktmoKey: true,
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
  const regionLookup = getRegionLookup(regions);
  const formTypeByCode = new Map(formTypes.map((formType) => [formType.code, formType]));

  for (const year of years) {
    await prisma.reportingYear.upsert({
      where: {
        year,
      },
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
      id: CANONICAL_DOCX_BATCH_NAME,
    },
    update: {
      sourceLabel: "filesystem-docx",
      notes: "Канонический DOCX-реестр из statforms_raw и statforms_docx_2024.",
    },
    create: {
      id: CANONICAL_DOCX_BATCH_NAME,
      name: CANONICAL_DOCX_BATCH_NAME,
      sourceLabel: "filesystem-docx",
      notes: "Канонический DOCX-реестр из statforms_raw и statforms_docx_2024.",
    },
  });

  let createdFiles = 0;
  let updatedFiles = 0;
  let matchedRegions = 0;
  let unmatchedRegions = 0;

  for (const entry of entries) {
    const matchedRegion = findCanonicalRegionByName(regionLookup, entry.regionNameCandidate);
    const formType = formTypeByCode.get(entry.formCode) ?? null;
    const reportingYear = reportingYearByYear.get(entry.year) ?? null;
    const fileId = createDocxImportFileId(entry.sourcePath);
    const existing = await prisma.importFile.findUnique({
      where: {
        id: fileId,
      },
      select: {
        id: true,
      },
    });

    if (matchedRegion) {
      matchedRegions += 1;
    } else {
      unmatchedRegions += 1;
    }

    await prisma.importFile.upsert({
      where: {
        id: fileId,
      },
      update: {
        batchId: batch.id,
        formTypeId: formType?.id ?? null,
        regionId: matchedRegion?.id ?? null,
        reportingYearId: reportingYear?.id ?? null,
        originalName: entry.originalName,
        storagePath: entry.sourcePath,
        checksumSha256: entry.checksumSha256,
        fileExtension: path.extname(entry.sourcePath) || ".docx",
        status: ImportFileStatus.CLASSIFIED,
        detectedMetadata: {
          docxRegistry: {
            source: entry.sourceKind,
            sourcePath: entry.sourcePath,
            year: entry.year,
            formCode: entry.formCode,
            regionNameCandidate: entry.regionNameCandidate,
            regionMatchKey: entry.regionMatchKey,
            code4: entry.code4,
            code5: entry.code5,
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
        reportingYearId: reportingYear?.id ?? null,
        originalName: entry.originalName,
        storagePath: entry.sourcePath,
        checksumSha256: entry.checksumSha256,
        fileExtension: path.extname(entry.sourcePath) || ".docx",
        status: ImportFileStatus.CLASSIFIED,
        detectedMetadata: {
          docxRegistry: {
            source: entry.sourceKind,
            sourcePath: entry.sourcePath,
            year: entry.year,
            formCode: entry.formCode,
            regionNameCandidate: entry.regionNameCandidate,
            regionMatchKey: entry.regionMatchKey,
            code4: entry.code4,
            code5: entry.code5,
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
    matchedRegions,
    unmatchedRegions,
  };
}

export async function importCanonicalDocxValuesToStaging(params?: {
  formCode?: string;
  year?: number;
  limit?: number;
  offset?: number;
  matchedOnly?: boolean;
}) {
  const files = await prisma.importFile.findMany({
    where: {
      batchId: CANONICAL_DOCX_BATCH_NAME,
      ...(params?.matchedOnly
        ? {
            regionId: {
              not: null,
            },
          }
        : {}),
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
    skip: params?.offset ?? undefined,
    take: params?.limit ?? undefined,
    include: {
      formType: true,
      reportingYear: true,
    },
  });

  if (files.length === 0) {
    return {
      selectedFiles: 0,
      importedFiles: 0,
      totalValues: 0,
      missingSemantics: 0,
      uniqueStructureSignatures: 0,
    };
  }

  let importedFiles = 0;
  let totalValues = 0;
  let missingSemantics = 0;
  const structureSignatures = new Set<string>();

  for (const file of files) {
    if (!file.formType?.code || !file.reportingYear?.year) {
      continue;
    }

    const extraction = await extractCanonicalDocxRows({
      filePath: file.storagePath,
      formCode: file.formType.code,
      year: file.reportingYear.year,
    });

    const values = extraction.rows.map((row) => ({
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
      confidence: row.table_title || row.row_label || row.col_label ? 0.99 : 0.6,
      contextJson: {
        source: "canonical_docx",
        form: row.form,
        year: row.year,
        xmlTag: row.xml_tag,
        tableCode: row.table_code,
        tableTitle: row.table_title,
        rowNo: row.row_no,
        rowLabel: row.row_label,
        colNo: row.col_no,
        colLabel: row.col_label,
        tblSeq: row.tbl_seq,
        gridRow: row.grid_r,
        gridCol: row.grid_c,
      },
    }));

    const currentMissingSemantics = extraction.rows.filter(
      (row) => !row.table_title && !row.row_label && !row.col_label,
    ).length;
    missingSemantics += currentMissingSemantics;
    totalValues += values.length;
    structureSignatures.add(extraction.structureSignature);

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
              in: ["DOCX_VALUE_IMPORT_NO_SEMANTICS", "DOCX_VALUE_IMPORT_EMPTY"],
            },
          },
        });

        if (values.length > 0) {
          await tx.importFieldValue.createMany({
            data: values.map((value) => ({
              importFileId: file.id,
              rawKey: value.rawKey,
              rawLabel: value.rawLabel,
              normalizedKey: value.normalizedKey,
              valueText: value.valueText,
              valueNumber: value.valueNumber,
              confidence: value.confidence,
              contextJson: value.contextJson,
            })),
          });
        } else {
          await tx.importIssue.create({
            data: {
              importFileId: file.id,
              code: "DOCX_VALUE_IMPORT_EMPTY",
              message: "Python DOCX extractor не вернул значений для документа.",
              severity: ImportIssueSeverity.WARNING,
              detailsJson: {
                source: "canonical_docx",
              },
            },
          });
        }

        if (currentMissingSemantics > 0) {
          await tx.importIssue.create({
            data: {
              importFileId: file.id,
              code: "DOCX_VALUE_IMPORT_NO_SEMANTICS",
              message: `Для ${currentMissingSemantics} значений не удалось определить table/row/column контекст.`,
              severity: ImportIssueSeverity.WARNING,
              detailsJson: {
                source: "canonical_docx",
                missingSemantics: currentMissingSemantics,
              },
            },
          });
        }

        await tx.importFile.update({
          where: {
            id: file.id,
          },
          data: {
            status: ImportFileStatus.EXTRACTED,
            extractedPayload: {
              source: "canonical_docx",
              totalValues: values.length,
              numericValues: values.filter((value) => value.valueNumber !== null).length,
              missingSemantics: currentMissingSemantics,
              structureSignature: extraction.structureSignature,
              structureStats: extraction.structureStats,
            },
          },
        });
      },
      {
        maxWait: 10000,
        timeout: 120000,
      },
    );

    importedFiles += 1;
  }

  return {
    selectedFiles: files.length,
    importedFiles,
    totalValues,
    missingSemantics,
    uniqueStructureSignatures: structureSignatures.size,
  };
}

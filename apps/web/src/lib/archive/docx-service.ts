import { createHash } from "node:crypto";
import path from "node:path";

import { ImportFileStatus, ImportIssueSeverity } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadHandoffScopeEntities, normalizeCanonText } from "./handoff";
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

type ScopeLookupRecord = {
  scopeType: string;
  scopeKey: string;
  scopeNameCanon: string;
  code4: string | null;
};

function createDocxImportFileId(sourceDoc: string) {
  return `docx_${createHash("sha1").update(sourceDoc).digest("hex")}`;
}

function getRegionLookup(regions: RegionLookupRecord[]) {
  const byName = new Map<string, RegionLookupRecord>();

  for (const region of regions) {
    for (const alias of createNameAliasKeys(region.fullName)) {
      byName.set(alias, region);
    }
    for (const alias of createNameAliasKeys(region.shortName)) {
      byName.set(alias, region);
    }
    for (const alias of getManualRegionAliases(region)) {
      byName.set(alias, region);
    }
  }

  return {
    byName,
  };
}

function getScopeLookup(scopes: ScopeLookupRecord[]) {
  const byName = new Map<string, ScopeLookupRecord>();
  const byCode4 = new Map<string, ScopeLookupRecord>();

  for (const scope of scopes) {
    for (const alias of createNameAliasKeys(scope.scopeNameCanon)) {
      byName.set(alias, scope);
    }
    for (const alias of getManualScopeAliases(scope)) {
      byName.set(alias, scope);
    }

    if (scope.code4) {
      byCode4.set(scope.code4, scope);
    }
  }

  return {
    byName,
    byCode4,
  };
}

function getManualRegionAliases(region: RegionLookupRecord) {
  const rawAliases: string[] = [];

  switch (region.code) {
    case "OKTMO_97000000000":
      rawAliases.push("Чувашская Республика", "Чувашская", "Чувашия");
      break;
    case "KHANTY_MANSI_AO":
      rawAliases.push("Ханты-Мансийский АО", "Ханты-Мансийский", "ХМАО", "ХМАО-Югра");
      break;
    case "JEWISH_AO":
      rawAliases.push("Еврейская автономная обла", "Еврейская АО", "Еврейская-АО", "Еврейская");
      break;
    case "OKTMO_90000000000":
      rawAliases.push(
        "Республика Северная Осети",
        "Респ.Сев.Осетия-Алания",
        "Северная Осетия",
        "Осетия-Алания",
      );
      break;
    case "CHUKOTKA_AO":
      rawAliases.push("Чукотский автономный окру", "Чукотский АО", "Чукотский");
      break;
    case "SAKHA":
      rawAliases.push("Саха(Якутия)", "Саха (Якутия)", "Респ.Саха(Якутия)", "Якутия");
      break;
    case "KABARDINO_BALKARIA":
      rawAliases.push("Кабардино-Балкар.Респ.", "Кабардино-Балкар", "Кабардино-Балкария");
      break;
    case "KARACHAY_CHERKESSIA":
      rawAliases.push("Карачаево-Черкес.Респ.", "Карачаево-Черкес", "Карачаево-Черкесия");
      break;
    case "UDMURTIA":
      rawAliases.push("Удмуртская Республ.", "Удмуртская", "Удмуртия");
      break;
    case "MOSCOW":
      rawAliases.push("Г.Москва", "Город Москва");
      break;
    case "SAINT_PETERSBURG":
      rawAliases.push("Г.Санкт-Петербург", "Город Санкт-Петербург");
      break;
    case "SEVASTOPOL":
      rawAliases.push("Г.Севастополь", "Город Севастополь");
      break;
    case "ARKHANGELSK":
      rawAliases.push("Архангельс.обл.без АО", "Архангельская область без", "Архангельская-без-АО");
      break;
    case "DONETSK":
      rawAliases.push("Донецкая Народная Респуб.", "Донецкая Народная Республ", "ДНР");
      break;
    case "LUGANSK":
      rawAliases.push("Луганская Народная Респуб", "Луганская Народная Республ", "ЛНР");
      break;
    default:
      break;
  }

  return rawAliases.flatMap((alias) => [...createNameAliasKeys(alias)]);
}

function getManualScopeAliases(scope: ScopeLookupRecord) {
  const rawAliases: string[] = [];

  switch (scope.scopeKey) {
    case "FMBA":
      rawAliases.push("ФМБА");
      break;
    case "UDPRF_GMU":
      rawAliases.push(
        "Главное медицинское управ",
        "Гл.мед.упр.дел.пр.",
        "Упр-делами-Президента",
      );
      break;
    case "NEW_SUBJECTS":
      rawAliases.push("Свод по нов.территориям", "Свод по нов территориям");
      break;
    case "RF_NEW":
      rawAliases.push(
        "РФ с учет.новых терр.",
        "РФ с учетом новых террит.",
        "РФ с учет новых террит",
        "РФ С УЧЕТ.НОВЫХ ТЕРРИТ.",
      );
      break;
    case "RF":
      rawAliases.push("РФ");
      break;
    default:
      break;
  }

  return rawAliases.flatMap((alias) => [...createNameAliasKeys(alias)]);
}

function createNameAliasKeys(value: string | null | undefined) {
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

    const stripped = stripGenericGeoTokens(normalized);

    if (stripped) {
      aliases.add(stripped);
    }
  }

  return aliases;
}

function normalizeRegionAliasSource(value: string) {
  const normalized = value
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
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const expandedTokens = normalized
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => {
      switch (token) {
        case "РЕСП":
        case "РЕСПУБЛИКА":
          return ["РЕСПУБЛИКА"];
        case "ОБЛ":
        case "ОБЛАСТЬ":
          return ["ОБЛАСТЬ"];
        case "ФЕД":
        case "ФЕДЕР":
        case "ФЕДЕРАЛЬН":
        case "ФЕДЕРАЛЬНЫЙ":
          return ["ФЕДЕРАЛЬНЫЙ"];
        case "ОКР":
        case "ОКРУГ":
          return ["ОКРУГ"];
        case "АВТ":
        case "АВТОН":
        case "АВТОНОМНАЯ":
        case "АВТОНОМНЫЙ":
          return ["АВТОНОМНЫЙ"];
        case "АО":
          return ["АВТОНОМНЫЙ", "ОКРУГ"];
        case "ФО":
          return ["ФЕДЕРАЛЬНЫЙ", "ОКРУГ"];
        default:
          return [token];
      }
    });

  return expandedTokens.join(" ").replace(/\s+/g, " ").trim();
}

function stripGenericGeoTokens(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .filter(
      (token) =>
        ![
          "БЕЗ",
          "РЕСПУБЛИКА",
          "ГОРОД",
          "ФЕДЕРАЛЬНАЯ",
          "ФЕДЕРАЛЬНЫЙ",
          "ТЕРРИТОРИЯ",
          "АВТОНОМНАЯ",
          "АВТОНОМНЫЙ",
          "ОКРУГ",
          "ОБЛАСТЬ",
          "КРАЙ",
          "ФО",
        ].includes(token),
    )
    .join(" ")
    .trim();
}

function findCanonicalRegionByName(
  lookup: ReturnType<typeof getRegionLookup>,
  canonicalName: string | null | undefined,
) {
  for (const alias of createNameAliasKeys(canonicalName)) {
    const matchedRegion = lookup.byName.get(alias);
    if (matchedRegion) {
      return matchedRegion;
    }
  }

  return null;
}

function findCanonicalScope(
  lookup: ReturnType<typeof getScopeLookup>,
  params: {
    code4?: string | null;
    canonicalName?: string | null;
  },
) {
  if (params.code4) {
    const matchedByCode4 = lookup.byCode4.get(params.code4);
    if (matchedByCode4) {
      return matchedByCode4;
    }
  }

  for (const alias of createNameAliasKeys(params.canonicalName)) {
    const matchedScope = lookup.byName.get(alias);
    if (matchedScope) {
      return matchedScope;
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

async function runWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<TResult>,
) {
  const normalizedConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: normalizedConcurrency }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          break;
        }

        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

export async function importCanonicalDocxArchiveRegistry() {
  const [entries, regions, formTypes, scopeEntities] = await Promise.all([
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
    loadHandoffScopeEntities(),
  ]);

  const years = Array.from(new Set(entries.map((entry) => entry.year))).sort();
  const regionLookup = getRegionLookup(regions);
  const scopeLookup = getScopeLookup(scopeEntities);
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
  let matchedSubjects = 0;
  let unmatchedSubjects = 0;
  let scopeEntries = 0;

  for (const entry of entries) {
    const matchedRegion = findCanonicalRegionByName(regionLookup, entry.regionNameCandidate);
    const matchedScope =
      matchedRegion === null
        ? findCanonicalScope(scopeLookup, {
            code4: entry.code4,
            canonicalName: entry.regionNameCandidate,
          })
        : null;
    const resolvedKind = matchedScope ? "SCOPE" : "SUBJECT";
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

    if (resolvedKind === "SCOPE") {
      scopeEntries += 1;
    } else if (matchedRegion) {
      matchedSubjects += 1;
    } else {
      unmatchedSubjects += 1;
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
            resolvedKind,
            regionNameCandidate: entry.regionNameCandidate,
            regionMatchKey: entry.regionMatchKey,
            code4: entry.code4,
            code5: entry.code5,
            scopeType: matchedScope?.scopeType ?? null,
            scopeKey: matchedScope?.scopeKey ?? null,
            scopeNameCanon: matchedScope?.scopeNameCanon ?? null,
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
            resolvedKind,
            regionNameCandidate: entry.regionNameCandidate,
            regionMatchKey: entry.regionMatchKey,
            code4: entry.code4,
            code5: entry.code5,
            scopeType: matchedScope?.scopeType ?? null,
            scopeKey: matchedScope?.scopeKey ?? null,
            scopeNameCanon: matchedScope?.scopeNameCanon ?? null,
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
    scopeEntries,
  };
}

export async function importCanonicalDocxValuesToStaging(params?: {
  formCode?: string;
  year?: number;
  limit?: number;
  offset?: number;
  matchedOnly?: boolean;
  concurrency?: number;
  skipExtracted?: boolean;
}) {
  const files = await prisma.importFile.findMany({
    where: {
      batchId: CANONICAL_DOCX_BATCH_NAME,
      ...(params?.skipExtracted
        ? {
            status: {
              not: ImportFileStatus.EXTRACTED,
            },
          }
        : {}),
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

  const extractionResults = await runWithConcurrency(
    files,
    params?.concurrency ?? 2,
    async (file) => {
      if (!file.formType?.code || !file.reportingYear?.year) {
        return {
          imported: false,
          totalValues: 0,
          missingSemantics: 0,
          structureSignature: null as string | null,
        };
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

      return {
        imported: true,
        totalValues: values.length,
        missingSemantics: currentMissingSemantics,
        structureSignature: extraction.structureSignature,
      };
    },
  );

  const importedFiles = extractionResults.filter((result) => result.imported).length;
  const totalValues = extractionResults.reduce((sum, result) => sum + result.totalValues, 0);
  const missingSemantics = extractionResults.reduce(
    (sum, result) => sum + result.missingSemantics,
    0,
  );
  const structureSignatures = new Set(
    extractionResults
      .map((result) => result.structureSignature)
      .filter((value): value is string => Boolean(value)),
  );

  return {
    selectedFiles: files.length,
    importedFiles,
    totalValues,
    missingSemantics,
    uniqueStructureSignatures: structureSignatures.size,
  };
}

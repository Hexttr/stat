import { createHash } from "node:crypto";
import path from "node:path";

import {
  FormAssignmentStatus,
  FormTemplateVersionStatus,
  ImportFileStatus,
  OrganizationType,
  Prisma,
  SubmissionStatus,
} from "@/generated/prisma/client";
import { projectSchemaToFields } from "@/lib/form-builder/projection";
import {
  createDefaultFormSchema,
  duplicateFormSchema,
  formBuilderSchema,
  type FormTableRow,
  type FormTableSchema,
  parseAndNormalizeFormSchema,
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
const F12_ROW_RANK_TABLE_CODES = new Set([
  "1000",
  "1100",
  "1500",
  "1600",
  "2000",
  "2100",
  "2200",
  "3000",
  "3100",
  "4000",
  "4100",
]);
const F12_PRIMARY_COLUMN_RANK_TABLE_CODES = new Set([
  "1000",
  "1500",
  "2000",
  "3000",
  "4000",
]);
const F12_ARCHIVE_STRUCTURE_PLAN = [
  { tableId: "table_1", tableCode: "1000" },
  { tableId: "table_2", tableCode: "1100" },
  { tableId: "table_3", tableCode: "1500" },
  { tableId: "table_4", tableCode: "1600" },
  { tableId: "table_5", tableCode: "2000" },
  { tableId: "table_6", tableCode: "2100" },
  { tableId: "table_7", tableCode: "2200" },
  { tableId: "table_8", tableCode: "3000" },
  { tableId: "table_9", tableCode: "3100" },
  { tableId: "table_10", tableCode: "4000" },
  { tableId: "table_11", tableCode: "4100" },
] as const;
const F12_AUXILIARY_TABLE_CODES = [
  "1001",
  "1002",
  "1003",
  "1004",
  "1005",
  "1006",
  "1007",
  "1009",
  "1601",
  "1650",
  "1700",
  "1800",
  "1900",
  "2001",
  "2003",
  "2004",
  "2005",
  "2006",
  "2007",
  "2009",
  "4001",
  "4003",
  "4004",
  "4005",
  "4007",
  "4008",
  "4009",
] as const;

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

function normalizeArchiveCode(value: string | null | undefined) {
  return normalizeArchiveText(value)
    .replace(/[а]/g, "a")
    .replace(/[в]/g, "b")
    .replace(/[с]/g, "c")
    .replace(/[е]/g, "e")
    .replace(/[н]/g, "h")
    .replace(/[к]/g, "k")
    .replace(/[м]/g, "m")
    .replace(/[о]/g, "o")
    .replace(/[р]/g, "p")
    .replace(/[т]/g, "t")
    .replace(/[х]/g, "x")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*,\s*/g, ", ");
}

function getArchiveTableId(tableCode: string | null | undefined) {
  const parsed = Number(tableCode);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  const index = parsed / 1000;
  return Number.isInteger(index) ? `table_${index}` : null;
}

function getF12ArchiveTableId(tableCode: string | null | undefined) {
  const parsed = Number(tableCode);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (F12_AUXILIARY_TABLE_CODES.includes(String(parsed) as (typeof F12_AUXILIARY_TABLE_CODES)[number])) {
    return getF12AuxiliaryTableId(String(parsed));
  }

  if (parsed >= 1000 && parsed < 1100) {
    return "table_1";
  }
  if (parsed >= 1100 && parsed < 1500) {
    return "table_2";
  }
  if (parsed >= 1500 && parsed < 1600) {
    return "table_3";
  }
  if (parsed >= 1600 && parsed < 2000) {
    return "table_4";
  }
  if (parsed >= 2000 && parsed < 2100) {
    return "table_5";
  }
  if (parsed >= 2100 && parsed < 2200) {
    return "table_6";
  }
  if (parsed >= 2200 && parsed < 3000) {
    return "table_7";
  }
  if (parsed >= 3000 && parsed < 3100) {
    return "table_8";
  }
  if (parsed >= 3100 && parsed < 4000) {
    return "table_9";
  }
  if (parsed >= 4000 && parsed < 4100) {
    return "table_10";
  }
  if (parsed >= 4100 && parsed < 5000) {
    return "table_11";
  }

  return getArchiveTableId(tableCode);
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
  const normalized = normalizeArchiveCode(value).toUpperCase();
  const match = normalized.match(/[A-Z]\d{2}(?:\.\d+)?(?:-[A-Z]?\d{2}(?:\.\d+)?)?/);
  return match?.[0] ?? null;
}

function isCompactArchiveCodeLabel(value: string | null | undefined) {
  const normalized = normalizeArchiveCode(value).toUpperCase();
  return Boolean(normalized) && /[A-Z]\d{2}/.test(normalized) && /^[A-Z0-9.,;()\- ]+$/.test(normalized);
}

function extractFieldColumnIndex(columnKey: string | null | undefined) {
  const match = (columnKey ?? "").match(/^value_(\d+)_/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFieldRowIndex(rowKey: string | null | undefined) {
  const match =
    (rowKey ?? "").match(/__(\d+)$/) ??
    (rowKey ?? "").match(/^row_(\d+)/) ??
    null;
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function shouldUseF12RowRankFallback(tableCode: string | null | undefined) {
  return F12_ROW_RANK_TABLE_CODES.has(tableCode ?? "");
}

function shouldPreferF12ColumnRank(tableCode: string | null | undefined) {
  return F12_PRIMARY_COLUMN_RANK_TABLE_CODES.has(tableCode ?? "");
}

function normalizeF12PrintedRowNumber(rawRowNo: string | null | undefined) {
  const digits = (rawRowNo ?? "").replace(/\D/g, "");
  if (digits.length < 2) {
    return null;
  }

  const wholePart = String(Number(digits.slice(0, -1)));
  const decimalPart = digits.slice(-1);
  return normalizeArchiveText(`${wholePart}.${decimalPart}`);
}

function getTableNumericSuffix(tableId: string) {
  const match = tableId.match(/^table_(\d+)$/);
  return match?.[1] ?? tableId;
}

function createF12ColumnLabel(rawColumnNumber: string) {
  const normalized = normalizeArchiveText(rawColumnNumber);
  if (/^\d+$/.test(normalized)) {
    return `Графа ${normalized}`;
  }

  return normalized ? `Графа ${normalized}` : "Новая графа";
}

function getF12AuxiliaryTableId(tableCode: string) {
  return `table_aux_${tableCode}`;
}

function isF12AuxiliaryTableId(tableId: string | null | undefined) {
  return (tableId ?? "").startsWith("table_aux_");
}

function cleanArchiveSemanticLabel(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\s+\d+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createNextRowKey(sampleRowKey: string | null | undefined, nextIndex: number) {
  const sample = sampleRowKey ?? "row_";
  const match = sample.match(/^(.*?)(\d+)$/);
  if (!match) {
    return `${sample}_${nextIndex}`;
  }

  return `${match[1]}${nextIndex}`;
}

type F12ManualRowSplit = {
  tableIds: string[];
  anchorPrintedNo: string;
  anchorCode: string;
  anchorLabel: string;
  insertPrintedNo: string;
  insertCode: string;
  insertLabel: string;
};

const F12_MANUAL_ROW_SPLITS: F12ManualRowSplit[] = [
  {
    tableIds: ["table_1", "table_5", "table_8", "table_10"],
    anchorPrintedNo: "3.0",
    anchorCode: "C00-D48",
    anchorLabel: "новообразования",
    insertPrintedNo: "2.3.1",
    insertCode: "B18.2",
    insertLabel: "из них хронический вирусный гепатит С",
  },
  {
    tableIds: ["table_1", "table_5", "table_8", "table_10"],
    anchorPrintedNo: "4.2.1.1",
    anchorCode: "D68.0",
    anchorLabel: "в т.ч. болезнь Виллебранда",
    insertPrintedNo: "4.2.1",
    insertCode: "D66-D68",
    insertLabel: "из них: гемофилия",
  },
  {
    tableIds: ["table_1", "table_5", "table_8", "table_10"],
    anchorPrintedNo: "5.0",
    anchorCode: "E00-E89",
    anchorLabel: "болезни эндокринной системы, расстройства питания и нарушения обмена веществ",
    insertPrintedNo: "4.3.1",
    insertCode: "D89.8",
    insertLabel:
      "из них другие уточненные нарушения с вовлечением иммунного механизма, не классифицированные в других рубриках",
  },
  {
    tableIds: ["table_1", "table_5", "table_8", "table_10"],
    anchorPrintedNo: "8.11",
    anchorCode: "H49-H52",
    anchorLabel:
      "болезни мышц глаза, нарушения содружественного движения глаз, аккомодации и рефракции",
    insertPrintedNo: "8.10.1",
    insertCode: "H47.2",
    insertLabel: "из них атрофия зрительного нерва",
  },
  {
    tableIds: ["table_8", "table_10"],
    anchorPrintedNo: "7.5",
    anchorCode: "G35-G37",
    anchorLabel: "демиелинизирующие болезни центральной нервной системы",
    insertPrintedNo: "7.4.1",
    insertCode: "G30",
    insertLabel: "из них болезнь Альцгеймера",
  },
  {
    tableIds: ["table_10"],
    anchorPrintedNo: "7.8",
    anchorCode: "G70-G73",
    anchorLabel: "болезни нервно-мышечного синапса и мышц",
    insertPrintedNo: "7.7.1",
    insertCode: "G61.0",
    insertLabel: "из них синдром Гийена-Барре",
  },
  {
    tableIds: ["table_1", "table_5", "table_8", "table_10"],
    anchorPrintedNo: "13.5",
    anchorCode: "L93.0",
    anchorLabel: "дискоидная красная волчанка",
    insertPrintedNo: "13.4.1",
    insertCode: "L40.5",
    insertLabel: "из него: псориаз артропатический",
  },
  {
    tableIds: ["table_8"],
    anchorPrintedNo: "4.0",
    anchorCode: "D50-D89",
    anchorLabel: "болезни крови, кроветворных органов и отдельные нарушения, вовлекающие иммунный механизм",
    insertPrintedNo: "3.2.1",
    insertCode: "D25",
    insertLabel: "из них лейомиома матки",
  },
  {
    tableIds: ["table_8"],
    anchorPrintedNo: "14.1.2",
    anchorCode: "M02",
    anchorLabel: "реактивные артропатии",
    insertPrintedNo: "14.1.1",
    insertCode: "M00.1",
    insertLabel: "из них: пневмококковый артрит и полиартрит",
  },
  {
    tableIds: ["table_1"],
    anchorPrintedNo: "7.4",
    anchorCode: "G30-G31",
    anchorLabel: "другие дегенеративные болезни нервной системы",
    insertPrintedNo: "7.3.2",
    insertCode: "G25",
    insertLabel: "из них другие экстрапирамидные и двигательные нарушения",
  },
  {
    tableIds: ["table_1", "table_5", "table_8", "table_10"],
    anchorPrintedNo: "14.4",
    anchorCode: "M45-M48",
    anchorLabel: "спондилопатии",
    insertPrintedNo: "14.3.1",
    insertCode: "M40-M41",
    insertLabel: "из них: кифоз, лордоз, сколиоз",
  },
  {
    tableIds: ["table_1"],
    anchorPrintedNo: "12.6",
    anchorCode: "K64",
    anchorLabel: "геморрой",
    insertPrintedNo: "12.5.1",
    insertCode: "K56",
    insertLabel: "из них: паралитический илеус и непроходимость кишечника без грыжи",
  },
  {
    tableIds: ["table_1", "table_5", "table_8", "table_10"],
    anchorPrintedNo: "5.12",
    anchorCode: "E70.0",
    anchorLabel: "фенилкетонурия",
    insertPrintedNo: "5.11.1",
    insertCode: "E66.2",
    insertLabel: "из них, крайняя степень ожирения",
  },
  {
    tableIds: ["table_1", "table_5", "table_8", "table_10"],
    anchorPrintedNo: "15.9",
    anchorCode: "N80",
    anchorLabel: "эндометриоз",
    insertPrintedNo: "15.8.1",
    insertCode: "N70",
    insertLabel: "из них сальпингит и оофорит",
  },
  {
    tableIds: ["table_5"],
    anchorPrintedNo: "12.2",
    anchorCode: "K29",
    anchorLabel: "гастрит и дуоденит",
    insertPrintedNo: "12.1",
    insertCode: "K25-K26",
    insertLabel: "из них: язва желудка и двенадцатиперстной кишки",
  },
];

function getTableDescriptorIds(table: FormTableSchema) {
  return {
    printedNumberId: table.descriptorColumns[0]?.id ?? null,
    codeId: table.descriptorColumns[1]?.id ?? null,
  };
}

function getRowDescriptorValue(row: FormTableRow, descriptorId: string | null) {
  if (!descriptorId) {
    return null;
  }

  return row.descriptorValues?.[descriptorId] ?? null;
}

function setRowDescriptorValue(
  row: FormTableRow,
  descriptorId: string | null,
  value: string | null,
) {
  if (!descriptorId) {
    return;
  }

  row.descriptorValues = {
    ...row.descriptorValues,
    [descriptorId]: value,
  };
}

function findF12RowByDescriptors(
  table: FormTableSchema,
  printedNo: string,
  code: string,
) {
  const { printedNumberId, codeId } = getTableDescriptorIds(table);
  return table.rows.find((row) => {
    const rowPrintedNo = normalizeArchiveText(getRowDescriptorValue(row, printedNumberId));
    const rowCode = normalizeArchiveCode(getRowDescriptorValue(row, codeId));
    return (
      rowPrintedNo === normalizeArchiveText(printedNo) &&
      rowCode === normalizeArchiveCode(code)
    );
  });
}

function reindexF12TableRows(table: FormTableSchema) {
  const sampleKey = table.rows[0]?.key ?? `${table.id}_row_`;
  const keyPrefix = sampleKey.replace(/\d+$/g, "") || `${table.id}_row_`;

  table.rows = table.rows.map((row, index) => ({
    ...row,
    id: `row_${index + 1}`,
    key: `${keyPrefix}${index + 1}`,
  }));
}

function applyF12ManualRowSplits(schema: ReturnType<typeof parseAndNormalizeFormSchema>) {
  let addedRows = 0;
  const updatedTables = new Set<string>();

  for (const split of F12_MANUAL_ROW_SPLITS) {
    for (const tableId of split.tableIds) {
      const table = schema.tables.find((item) => item.id === tableId);
      if (!table) {
        continue;
      }

      const existingInsertedRow = findF12RowByDescriptors(
        table,
        split.insertPrintedNo,
        split.insertCode,
      );
      const anchorRow = findF12RowByDescriptors(table, split.anchorPrintedNo, split.anchorCode);

      if (existingInsertedRow) {
        existingInsertedRow.label = split.insertLabel;
      }

      if (!anchorRow) {
        continue;
      }

      anchorRow.label = split.anchorLabel;

      if (existingInsertedRow) {
        updatedTables.add(table.id);
        continue;
      }

      const anchorIndex = table.rows.findIndex((row) => row.key === anchorRow.key);
      if (anchorIndex === -1) {
        continue;
      }

      const { printedNumberId, codeId } = getTableDescriptorIds(table);
      const insertedRow = {
        ...anchorRow,
        id: anchorRow.id,
        key: anchorRow.key,
        label: split.insertLabel,
        description: anchorRow.description ?? null,
        groupPrefix: anchorRow.groupPrefix ?? null,
        descriptorValues: {
          ...anchorRow.descriptorValues,
        },
      } as (typeof table.rows)[number];
      setRowDescriptorValue(insertedRow, printedNumberId, split.insertPrintedNo);
      setRowDescriptorValue(insertedRow, codeId, split.insertCode);

      table.rows.splice(anchorIndex, 0, insertedRow);
      reindexF12TableRows(table);
      addedRows += 1;
      updatedTables.add(table.id);
    }
  }

  return {
    addedRows,
    updatedTables: Array.from(updatedTables),
  };
}

function applyF12RepeatedTable3Splits(schema: ReturnType<typeof parseAndNormalizeFormSchema>) {
  const table = schema.tables.find((item) => item.id === "table_3");
  if (!table) {
    return {
      addedRows: 0,
      updatedTables: [] as string[],
    };
  }

  const repeatedSplits = [
    {
      anchorPrintedNo: "5.0",
      anchorCode: "E00-E89",
      anchorLabel: "болезни эндокринной системы, расстройства питания и нарушения обмена веществ",
      insertPrintedNo: "4.1",
      insertCode: "D50-D64",
      insertLabel: "из них: анемии",
    },
    {
      anchorPrintedNo: "9.0",
      anchorCode: "H60-H95",
      anchorLabel: "болезни уха и сосцевидного отростка",
      insertPrintedNo: "8.6",
      insertCode: "H35.1",
      insertLabel: "из них: преретинопатия",
    },
  ] as const;

  const { printedNumberId, codeId } = getTableDescriptorIds(table);
  let addedRows = 0;

  for (const split of repeatedSplits) {
    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      const row = table.rows[rowIndex];
      const rowPrintedNo = normalizeArchiveText(getRowDescriptorValue(row, printedNumberId));
      const rowCode = normalizeArchiveCode(getRowDescriptorValue(row, codeId));

      if (
        rowPrintedNo !== normalizeArchiveText(split.anchorPrintedNo) ||
        rowCode !== normalizeArchiveCode(split.anchorCode)
      ) {
        continue;
      }

      row.label = split.anchorLabel;

      const previousRow = table.rows[rowIndex - 1];
      const previousRowCode = normalizeArchiveCode(getRowDescriptorValue(previousRow, codeId));
      if (previousRowCode === normalizeArchiveCode(split.insertCode)) {
        continue;
      }

      const insertedRow = {
        ...row,
        id: row.id,
        key: row.key,
        label: split.insertLabel,
        description: row.description ?? null,
        groupPrefix: row.groupPrefix ?? null,
        descriptorValues: {
          ...row.descriptorValues,
        },
      } as (typeof table.rows)[number];
      setRowDescriptorValue(insertedRow, printedNumberId, split.insertPrintedNo);
      setRowDescriptorValue(insertedRow, codeId, split.insertCode);

      table.rows.splice(rowIndex, 0, insertedRow);
      addedRows += 1;
      rowIndex += 1;
    }
  }

  if (addedRows > 0) {
    reindexF12TableRows(table);
  }

  return {
    addedRows,
    updatedTables: addedRows > 0 ? [table.id] : [],
  };
}

function columnLabelsMatch(params: {
  fieldColumnKey?: string | null;
  fieldColumnLabel: string;
  rawColumnLabel: string | null;
  rawColumnNumber: string | null;
  rawAlternateLabel?: string | null;
  allowShiftedPrintedNumbers?: boolean;
  allowSingleColumnFallback?: boolean;
}) {
  const fieldColumn = normalizeArchiveText(params.fieldColumnLabel);
  const rawColumn = normalizeArchiveText(params.rawColumnLabel);
  const rawColumnNo = normalizeArchiveText(params.rawColumnNumber);
  const rawAlternate = normalizeArchiveText(params.rawAlternateLabel);
  const rawAlternateClean = normalizeArchiveText(
    cleanArchiveSemanticLabel(params.rawAlternateLabel),
  );
  const fieldColumnIndex = extractFieldColumnIndex(params.fieldColumnKey);
  const rawColumnNoNumber = rawColumnNo ? Number(rawColumnNo) : null;

  if (fieldColumn && rawColumn && fieldColumn === rawColumn) {
    return true;
  }

  if (fieldColumn && rawAlternate && fieldColumn === rawAlternate) {
    return true;
  }

  if (fieldColumn && rawAlternateClean && fieldColumn === rawAlternateClean) {
    return true;
  }

  if (
    fieldColumn &&
    rawAlternateClean &&
    rawColumnNo &&
    fieldColumn.startsWith(rawAlternateClean) &&
    (fieldColumn.includes(`(гр. ${rawColumnNo})`) ||
      fieldColumn.includes(`(гр.${rawColumnNo})`) ||
      fieldColumn.endsWith(`гр. ${rawColumnNo}`))
  ) {
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

  if (
    params.allowShiftedPrintedNumbers !== false &&
    fieldColumnIndex &&
    Number.isFinite(rawColumnNoNumber) &&
    rawColumnNoNumber === fieldColumnIndex + 3
  ) {
    return true;
  }

  if (params.allowSingleColumnFallback) {
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
  const fieldRowCode = normalizeArchiveCode(params.fieldRowLabel);
  const rawRowCode = normalizeArchiveCode(params.rawRowLabel);
  const compactCodeOnlyRawRow = isCompactArchiveCodeLabel(params.rawRowLabel);

  if (!fieldRow || !rawRow) {
    return false;
  }

  if (compactCodeOnlyRawRow) {
    return fieldRow === rawRow || fieldRowCode === rawRowCode;
  }

  if (fieldRow === rawRow || fieldRow.includes(rawRow) || rawRow.includes(fieldRow)) {
    return true;
  }

  if (
    fieldRowCode &&
    rawRowCode &&
    (fieldRowCode === rawRowCode ||
      fieldRowCode.includes(rawRowCode) ||
      rawRowCode.includes(fieldRowCode))
  ) {
    return true;
  }

  const rawCode = extractDiagnosisCode(params.rawRowLabel);
  if (
    rawCode &&
    (fieldRow.includes(normalizeArchiveText(rawCode)) ||
      fieldRowCode.includes(normalizeArchiveCode(rawCode)))
  ) {
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

export async function enrichArchiveF12Structure(params?: {
  year?: number;
  versionId?: string;
}) {
  const targetYear = params?.year ?? 2024;
  const targetVersion =
    params?.versionId ??
    (
      await prisma.formTemplateVersion.findFirst({
        where: {
          title: {
            contains: "Архивная структура",
          },
          template: {
            formType: {
              code: "F12",
            },
          },
          reportingYear: {
            year: targetYear,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })
    )?.id ??
    null;

  if (!targetVersion) {
    throw new Error(`Не найдена архивная версия F12 за ${targetYear}.`);
  }

  const version = await prisma.formTemplateVersion.findUnique({
    where: {
      id: targetVersion,
    },
  });

  if (!version) {
    throw new Error(`Версия шаблона ${targetVersion} не найдена.`);
  }

  const schema = parseAndNormalizeFormSchema(version.schemaJson);
  let addedRows = 0;
  let addedColumns = 0;
  const updatedTables: string[] = [];

  for (const plan of F12_ARCHIVE_STRUCTURE_PLAN) {
    const tableIndex = schema.tables.findIndex((table) => table.id === plan.tableId);
    if (tableIndex === -1) {
      continue;
    }

    const table = schema.tables[tableIndex];
    const semanticRows = await prisma.$queryRaw<Array<{ row_no: string; row_label: string | null }>>`
      select
        row_no,
        max(nullif(trim(row_label), '')) as row_label
      from statforms.semantic_passports_final_v2
      where form = 'F12'
        and year = ${targetYear}
        and table_code = ${plan.tableCode}
      group by row_no
      order by row_no::int
    `;
    const semanticColumns = await prisma.$queryRaw<Array<{ col_no: string }>>`
      select col_no
      from statforms.semantic_passports_final_v2
      where form = 'F12'
        and year = ${targetYear}
        and table_code = ${plan.tableCode}
      group by col_no
      order by col_no::int
    `;

    let tableChanged = false;

    if (semanticColumns.length > table.columns.length) {
      const tableNumber = getTableNumericSuffix(table.id);
      for (let columnIndex = table.columns.length; columnIndex < semanticColumns.length; columnIndex += 1) {
        const rawColumnNumber = semanticColumns[columnIndex]?.col_no ?? String(columnIndex + 1);
        const templateColumn = table.columns[table.columns.length - 1] ?? table.columns[0];
        table.columns.push({
          ...templateColumn,
          id: `column_${tableNumber}_${columnIndex + 1}`,
          key: `value_${columnIndex + 1}_${tableNumber}`,
          label: createF12ColumnLabel(rawColumnNumber),
          sticky: false,
        });
        addedColumns += 1;
        tableChanged = true;
      }
    }

    if (semanticRows.length > table.rows.length) {
      const sampleRowKey = table.rows[table.rows.length - 1]?.key ?? table.rows[0]?.key ?? table.id;
      for (let rowIndex = table.rows.length; rowIndex < semanticRows.length; rowIndex += 1) {
        const rawRow = semanticRows[rowIndex];
        const descriptorValues = Object.fromEntries(
          table.descriptorColumns.map((column) => [column.id, null as string | null]),
        ) as Record<string, string | null>;

        if (table.descriptorColumns[0]) {
          descriptorValues[table.descriptorColumns[0].id] =
            normalizeF12PrintedRowNumber(rawRow?.row_no) ?? rawRow?.row_no ?? null;
        }

        if (table.descriptorColumns[1]) {
          descriptorValues[table.descriptorColumns[1].id] = rawRow?.row_label ?? null;
        }

        table.rows.push({
          id: `row_${rowIndex + 1}`,
          key: createNextRowKey(sampleRowKey, rowIndex + 1),
          label: rawRow?.row_label ?? `Строка ${rawRow?.row_no ?? rowIndex + 1}`,
          description: null,
          rowType: "data",
          indent: 0,
          groupPrefix: null,
          descriptorValues,
        });
        addedRows += 1;
        tableChanged = true;
      }
    }

    if (tableChanged) {
      updatedTables.push(table.id);
    }
  }

    const auxiliaryCells = await prisma.$queryRaw<
      Array<{
        table_code: string;
        table_title: string | null;
        row_no: string;
        row_label: string | null;
        col_no: string;
        col_label: string | null;
      }>
    >`
      select
        table_code,
        max(table_title) as table_title,
        row_no,
        max(row_label) as row_label,
        col_no,
        max(col_label) as col_label
      from statforms.semantic_passports_final_v2
      where form = 'F12'
        and year = ${targetYear}
        and table_code in (${Prisma.join(F12_AUXILIARY_TABLE_CODES)})
      group by table_code, row_no, col_no
      order by table_code, row_no::int, col_no::int
    `;

    const auxiliaryByCode = new Map<
      string,
      Array<{
        table_title: string | null;
        row_no: string;
        row_label: string | null;
        col_no: string;
        col_label: string | null;
      }>
    >();
    for (const cell of auxiliaryCells) {
      const entries = auxiliaryByCode.get(cell.table_code) ?? [];
      entries.push({
        table_title: cell.table_title,
        row_no: cell.row_no,
        row_label: cell.row_label,
        col_no: cell.col_no,
        col_label: cell.col_label,
      });
      auxiliaryByCode.set(cell.table_code, entries);
    }

    for (const tableCode of F12_AUXILIARY_TABLE_CODES) {
      const cells = auxiliaryByCode.get(tableCode) ?? [];
      if (cells.length === 0) {
        continue;
      }

      const auxiliaryTableId = getF12AuxiliaryTableId(tableCode);
      schema.tables = schema.tables.filter((table) => table.id !== auxiliaryTableId);

      const sortedCells = cells.sort(
        (left, right) =>
          Number(left.row_no) - Number(right.row_no) || Number(left.col_no) - Number(right.col_no),
      );
      const uniqueColumns = Array.from(
        new Map(sortedCells.map((cell) => [cell.col_no, cell])).values(),
      ).sort((left, right) => Number(left.col_no) - Number(right.col_no));
      const uniqueRows = Array.from(
        new Map(sortedCells.map((cell) => [cell.row_no, cell])).values(),
      ).sort((left, right) => Number(left.row_no) - Number(right.row_no));
      const rowHeading =
        cleanArchiveSemanticLabel(uniqueColumns[0]?.col_label) ||
        cleanArchiveSemanticLabel(uniqueRows[0]?.col_label) ||
        `Архивный блок ${tableCode}`;
      const title =
        cleanArchiveSemanticLabel(sortedCells[0]?.table_title) ||
        `Архивный блок ${tableCode}`;
      const descriptorColumns = [
        {
          id: `descriptor_${tableCode}_1`,
          key: `printed_row_${tableCode}`,
          label: "№ строки",
          width: 120,
          sticky: false,
        },
      ];

      const rows = uniqueRows.map((row, rowIndex) => ({
        id: `row_${tableCode}_${rowIndex + 1}`,
        key: `archive_${tableCode}_row_${rowIndex + 1}`,
        label:
          uniqueRows.length === 1
            ? rowHeading
            : cleanArchiveSemanticLabel(row.row_label) || `Строка ${row.row_no}`,
        description: null,
        rowType: "data" as const,
        indent: 0,
        groupPrefix: null,
        descriptorValues: {
          [descriptorColumns[0].id]: normalizeF12PrintedRowNumber(row.row_no) ?? row.row_no,
        },
      }));

      const rawColumnLabels = uniqueColumns.map((column) => {
        const preferredLabel = cleanArchiveSemanticLabel(
          uniqueRows.length === 1 ? column.row_label : column.col_label,
        );
        return preferredLabel || createF12ColumnLabel(column.col_no);
      });

      const columns = uniqueColumns.map((column, columnIndex) => {
        const baseLabel = rawColumnLabels[columnIndex];
        const label = baseLabel.includes(`(гр. ${column.col_no})`)
          ? baseLabel
          : `${baseLabel} (гр. ${column.col_no})`;

        return {
          id: `column_${tableCode}_${columnIndex + 1}`,
          key: `value_${columnIndex + 1}_${tableCode}`,
          label,
          fieldType: "number" as const,
          unit: "шт.",
          required: false,
          width: 220,
          sticky: false,
          placeholder: null,
          helpText: null,
          options: [],
          validation: {},
        };
      });

      schema.tables.push({
        id: auxiliaryTableId,
        title,
        description: `Автоматически добавленный архивный блок ${tableCode}.`,
        descriptorColumns,
        columns,
        rows,
        settings: {
          stickyHeader: true,
          stickyFirstColumn: true,
          horizontalScroll: true,
        },
      });
      updatedTables.push(auxiliaryTableId);
    }

  const manualSplits = applyF12ManualRowSplits(schema);
  addedRows += manualSplits.addedRows;
  for (const tableId of manualSplits.updatedTables) {
    if (!updatedTables.includes(tableId)) {
      updatedTables.push(tableId);
    }
  }

  const repeatedTable3Splits = applyF12RepeatedTable3Splits(schema);
  addedRows += repeatedTable3Splits.addedRows;
  for (const tableId of repeatedTable3Splits.updatedTables) {
    if (!updatedTables.includes(tableId)) {
      updatedTables.push(tableId);
    }
  }

  const normalizedSchema = parseAndNormalizeFormSchema(schema);
  const projectedFields = projectSchemaToFields(normalizedSchema);
  const existingArchiveSubmissionValues = await prisma.submissionValue.count({
    where: {
      submission: {
        assignment: {
          templateVersionId: version.id,
        },
      },
    },
  });

  await prisma.$transaction(
    async (tx) => {
      await tx.submissionValue.deleteMany({
        where: {
          submission: {
            assignment: {
              templateVersionId: version.id,
            },
          },
        },
      });

      await tx.formTemplateVersion.update({
        where: {
          id: version.id,
        },
        data: {
          schemaJson: normalizedSchema,
        },
      });

      await tx.formField.deleteMany({
        where: {
          templateVersionId: version.id,
        },
      });

      for (const fieldChunk of chunkArray(projectedFields, 1000)) {
        if (fieldChunk.length === 0) {
          continue;
        }

        await tx.formField.createMany({
          data: fieldChunk.map((field) => ({
            templateVersionId: version.id,
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
    },
    {
      timeout: 60_000,
    },
  );

  return {
    versionId: version.id,
    year: targetYear,
    updatedTables,
    addedRows,
    addedColumns,
    clearedSubmissionValues: existingArchiveSubmissionValues,
    fieldCount: projectedFields.length,
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

    const templateSchema = (assignment.templateVersion.schemaJson ?? {}) as {
      tables?: Array<{
        id?: string;
        rows?: Array<{
          key?: string;
          descriptorValues?: Record<string, string | number | null>;
        }>;
      }>;
    };
    const schemaRowLookupByTableId = new Map<
      string,
      { byPrintedNumber: Map<string, string>; byCode: Map<string, string> }
    >();
    for (const table of templateSchema.tables ?? []) {
      if (!table.id) {
        continue;
      }

      const byPrintedNumber = new Map<string, string>();
      const byCode = new Map<string, string>();

      for (const row of table.rows ?? []) {
        if (!row.key || !row.descriptorValues) {
          continue;
        }

        for (const descriptorValue of Object.values(row.descriptorValues)) {
          if (descriptorValue === null || descriptorValue === undefined) {
            continue;
          }

          const normalizedValue = normalizeArchiveText(String(descriptorValue));
          const normalizedCodeValue = normalizeArchiveCode(String(descriptorValue));
          if (!normalizedValue) {
            continue;
          }

          if (/^\d+(?:\.\d+)+$/.test(normalizedValue) || /^\d+\.\d$/.test(normalizedValue)) {
            byPrintedNumber.set(normalizedValue, row.key);
            continue;
          }

          byCode.set(normalizedValue, row.key);
          if (normalizedCodeValue) {
            byCode.set(normalizedCodeValue, row.key);
          }
        }
      }

      schemaRowLookupByTableId.set(table.id, {
        byPrintedNumber,
        byCode,
      });
    }

    const tableFields = assignment.templateVersion.fields.filter((field) => field.tableId);
    const fieldsByTableId = new Map<string, typeof tableFields>();
    const tableColumnKeys = new Map<string, Set<string>>();
    const tableRowItems = new Map<string, Array<{ rowKey: string; rowIndex: number }>>();

    for (const field of tableFields) {
      if (!field.tableId) {
        continue;
      }

      const existingFields = fieldsByTableId.get(field.tableId) ?? [];
      existingFields.push(field);
      fieldsByTableId.set(field.tableId, existingFields);

      const columnKeys = tableColumnKeys.get(field.tableId) ?? new Set<string>();
      if (field.columnKey) {
        columnKeys.add(field.columnKey);
      }
      tableColumnKeys.set(field.tableId, columnKeys);

      const rowIndex = extractFieldRowIndex(field.rowKey);
      if (!field.rowKey || rowIndex === null) {
        continue;
      }

      const existingRows = tableRowItems.get(field.tableId) ?? [];
      if (!existingRows.some((row) => row.rowKey === field.rowKey)) {
        existingRows.push({
          rowKey: field.rowKey,
          rowIndex,
        });
        tableRowItems.set(field.tableId, existingRows);
      }
    }

    const tableColumnCount = new Map<string, number>();
    for (const [tableId, columnKeys] of tableColumnKeys.entries()) {
      tableColumnCount.set(tableId, columnKeys.size);
    }

    const schemaColumnRankByTableId = new Map<string, Map<string, number>>();
    for (const [tableId, columnKeys] of tableColumnKeys.entries()) {
      const columnRankMap = new Map<string, number>();
      Array.from(columnKeys)
        .map((columnKey) => ({
          columnKey,
          columnIndex: extractFieldColumnIndex(columnKey) ?? Number.MAX_SAFE_INTEGER,
        }))
        .sort((left, right) => left.columnIndex - right.columnIndex)
        .forEach((column, index) => {
          columnRankMap.set(column.columnKey, index + 1);
        });
      schemaColumnRankByTableId.set(tableId, columnRankMap);
    }

    const schemaRowRankByTableId = new Map<string, Map<string, number>>();
    for (const [tableId, rows] of tableRowItems.entries()) {
      const rowRankMap = new Map<string, number>();
      rows
        .sort((left, right) => left.rowIndex - right.rowIndex)
        .forEach((row, index) => {
          rowRankMap.set(row.rowKey, index + 1);
        });
      schemaRowRankByTableId.set(tableId, rowRankMap);
    }
    const tableRowCount = new Map<string, number>();
    for (const [tableId, rows] of tableRowItems.entries()) {
      tableRowCount.set(tableId, rows.length);
    }

    const rawRowRankByTableCode = new Map<string, Map<string, number>>();
    const rawColumnRankByTableCode = new Map<string, Map<string, number>>();
    for (const fieldValue of file.fieldValues) {
      const context = (fieldValue.contextJson ?? {}) as {
        tableCode?: string | null;
        rowNo?: string | null;
        colNo?: string | null;
      };

      if (!context.tableCode) {
        continue;
      }

      const tableCode = context.tableCode;

      if (context.rowNo) {
        if (shouldUseF12RowRankFallback(tableCode)) {
          const rowRankMap = rawRowRankByTableCode.get(tableCode) ?? new Map<string, number>();
          if (!rowRankMap.has(context.rowNo)) {
            rowRankMap.set(context.rowNo, 0);
          }
          rawRowRankByTableCode.set(tableCode, rowRankMap);
        }
      }

      if (context.colNo) {
        const columnRankMap =
          rawColumnRankByTableCode.get(tableCode) ?? new Map<string, number>();
        if (!columnRankMap.has(context.colNo)) {
          columnRankMap.set(context.colNo, 0);
        }
        rawColumnRankByTableCode.set(tableCode, columnRankMap);
      }
    }

    for (const rowRankMap of rawRowRankByTableCode.values()) {
      Array.from(rowRankMap.keys())
        .sort((left, right) => Number(left) - Number(right))
        .forEach((rowNo, index) => {
          rowRankMap.set(rowNo, index + 1);
        });
    }

    for (const columnRankMap of rawColumnRankByTableCode.values()) {
      Array.from(columnRankMap.keys())
        .sort((left, right) => Number(left) - Number(right))
        .forEach((colNo, index) => {
          columnRankMap.set(colNo, index + 1);
        });
    }

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
        rowNo?: string | null;
        rowLabel?: string | null;
        colLabel?: string | null;
        colNo?: string | null;
      };
      const tableId = getF12ArchiveTableId(context.tableCode);

      if (!tableId) {
        fileUnmatched += 1;
        continue;
      }

      const tableSpecificFields = fieldsByTableId.get(tableId) ?? [];
      let columnMatchedFields: typeof tableSpecificFields = [];
      if (shouldPreferF12ColumnRank(context.tableCode)) {
        const rawColumnRank = context.colNo
          ? rawColumnRankByTableCode.get(context.tableCode ?? "")?.get(context.colNo) ?? null
          : null;
        const schemaColumnRankMap = schemaColumnRankByTableId.get(tableId) ?? null;

        if (rawColumnRank && schemaColumnRankMap) {
          columnMatchedFields = tableSpecificFields.filter((field) => {
            if (!field.columnKey) {
              return false;
            }

            return schemaColumnRankMap.get(field.columnKey) === rawColumnRank;
          });
        }
      }

      if (columnMatchedFields.length === 0) {
        columnMatchedFields = tableSpecificFields.filter((field) => {
          const { columnLabel } = getFieldLabelParts(field.label);
          const isSingleColumnTable =
            (tableColumnCount.get(field.tableId ?? tableId) ?? 0) <= 1;
          const allowShiftedPrintedNumbers = !isF12AuxiliaryTableId(field.tableId ?? tableId);
          return columnLabelsMatch({
            fieldColumnKey: field.columnKey,
            fieldColumnLabel: columnLabel,
            rawColumnLabel: context.colLabel ?? null,
            rawColumnNumber: context.colNo ?? null,
            rawAlternateLabel: context.rowLabel ?? null,
            allowShiftedPrintedNumbers,
            allowSingleColumnFallback: isSingleColumnTable,
          });
        });
      }

      if (columnMatchedFields.length === 0 && rawColumnRankByTableCode.has(context.tableCode ?? "")) {
        const rawColumnRank = context.colNo
          ? rawColumnRankByTableCode.get(context.tableCode ?? "")?.get(context.colNo) ?? null
          : null;
        const schemaColumnRankMap = schemaColumnRankByTableId.get(tableId) ?? null;

        if (rawColumnRank && schemaColumnRankMap) {
          columnMatchedFields = tableSpecificFields.filter((field) => {
            if (!field.columnKey) {
              return false;
            }

            return schemaColumnRankMap.get(field.columnKey) === rawColumnRank;
          });
        }
      }

      const isSingleRowTable = (tableRowCount.get(tableId) ?? 0) <= 1;
      const compactCodeOnlyRawRow = isCompactArchiveCodeLabel(context.rowLabel ?? null);
      if (
        columnMatchedFields.length !== 1 &&
        isSingleRowTable &&
        isF12AuxiliaryTableId(tableId) &&
        rawColumnRankByTableCode.has(context.tableCode ?? "")
      ) {
        const rawColumnRank = context.colNo
          ? rawColumnRankByTableCode.get(context.tableCode ?? "")?.get(context.colNo) ?? null
          : null;
        const schemaColumnRankMap = schemaColumnRankByTableId.get(tableId) ?? null;

        if (rawColumnRank && schemaColumnRankMap) {
          columnMatchedFields = tableSpecificFields.filter((field) => {
            if (!field.columnKey) {
              return false;
            }

            return schemaColumnRankMap.get(field.columnKey) === rawColumnRank;
          });
        }
      }

      let candidates = isSingleRowTable
        ? columnMatchedFields
        : columnMatchedFields.filter((field) => {
            const { rowLabel } = getFieldLabelParts(field.label);
            return rowLabelsMatch({
              fieldRowLabel: rowLabel,
              rawRowLabel: context.rowLabel ?? null,
            });
          });

      if (candidates.length !== 1) {
        const schemaRowLookup = schemaRowLookupByTableId.get(tableId) ?? null;
        const targetRowKey =
          schemaRowLookup?.byPrintedNumber.get(normalizeF12PrintedRowNumber(context.rowNo) ?? "") ??
          schemaRowLookup?.byCode.get(normalizeArchiveText(context.rowLabel)) ??
          schemaRowLookup?.byCode.get(normalizeArchiveCode(context.rowLabel)) ??
          null;

        if (compactCodeOnlyRawRow && targetRowKey) {
          candidates = columnMatchedFields.filter((field) => field.rowKey === targetRowKey);
        } else if (targetRowKey) {
          candidates = columnMatchedFields.filter((field) => field.rowKey === targetRowKey);
        }
      }

      if (
        candidates.length !== 1 &&
        !compactCodeOnlyRawRow &&
        shouldUseF12RowRankFallback(context.tableCode)
      ) {
        const rawRowRank = context.rowNo
          ? rawRowRankByTableCode.get(context.tableCode ?? "")?.get(context.rowNo) ?? null
          : null;
        const schemaRowRankMap = schemaRowRankByTableId.get(tableId) ?? null;

        if (rawRowRank && schemaRowRankMap) {
          candidates = columnMatchedFields.filter((field) => {
            if (!field.rowKey) {
              return false;
            }

            return schemaRowRankMap.get(field.rowKey) === rawRowRank;
          });
        }
      }

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

import path from "node:path";
import fs from "node:fs/promises";

import {
  createDefaultDescriptorColumn,
  createDefaultInputColumn,
  createDefaultRow,
  FormBuilderSchema,
  FormTableDescriptorColumn,
  FormTableRow,
  normalizeFormSchema,
} from "@/lib/form-builder/schema";

const WordExtractor = require("word-extractor");

const LEGACY_FORM_DIRECTORIES = {
  F12: "2024_F12",
  F14: "2024_F14",
  F19: "2024_F19",
  F30: "2024_F30",
} as const;

type LegacyFormCode = keyof typeof LEGACY_FORM_DIRECTORIES;

type LegacyTableDraft = {
  title: string;
  description: string | null;
  descriptorColumns: FormTableDescriptorColumn[];
  inputColumns: ReturnType<typeof createDefaultInputColumn>[];
  rows: FormTableRow[];
};

function getLegacyFormsRoot() {
  return path.resolve(process.cwd(), "..", "..", "forms");
}

function normalizeTextLine(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t{2,}/g, "\t")
    .trim();
}

function normalizeCell(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ ]{2,}/g, " ").trim();
}

function trimTrailingEmptyCells(cells: string[]) {
  const next = [...cells];

  while (next.length > 0 && next[next.length - 1] === "") {
    next.pop();
  }

  return next;
}

function parseTabbedCells(line: string, minSize = 0) {
  const rawCells = trimTrailingEmptyCells(line.split("\t").map(normalizeCell));
  const padded = [...rawCells];

  while (padded.length < minSize) {
    padded.push("");
  }

  return padded;
}

function isRomanOrSectionHeading(line: string) {
  return /^(РАЗДЕЛ|Раздел)\s+[A-ZА-ЯIVX0-9]+/i.test(line);
}

function isSubtableHeading(line: string) {
  return /^\d+\.\s+\S+/u.test(line) && !/\t/.test(line);
}

function isRowNumberCell(value: string) {
  return /^\d+(?:\.\d+)+(?:\.)?$/u.test(value.trim());
}

function isPlainNumericCell(value: string) {
  return /^\d+(?:\.\d+)?$/u.test(value.trim());
}

function isCodeCell(value: string) {
  return /^[A-ZА-Я]\d+(?:\.\d+)?(?:\s*[-–]\s*[A-ZА-Я]?\d+(?:\.\d+)?)?$/iu.test(value);
}

function isCodeFragmentCell(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return false;
  }

  return (
    /^[A-ZА-ЯЁ0-9.,;()\/\s–-]+$/iu.test(normalized) &&
    /[A-ZА-ЯЁ]/iu.test(normalized) &&
    /\d/u.test(normalized)
  );
}

function isValueCell(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return true;
  }

  return /^(?:\d+(?:[.,]\d+)?|[XХхx-])$/u.test(normalized);
}

function getRowNumberIndices(cells: string[]) {
  return cells.reduce<number[]>((accumulator, cell, index) => {
    if (isRowNumberCell(cell)) {
      accumulator.push(index);
    }

    return accumulator;
  }, []);
}

function findRowNumberIndex(cells: string[]) {
  return cells.findIndex((cell, index) => index > 0 && isRowNumberCell(cell));
}

function mergeHeaderLabels(headerLines: string[], totalColumns: number) {
  const matrix = headerLines.map((line) => parseTabbedCells(line, totalColumns));

  return Array.from({ length: totalColumns }, (_, columnIndex) => {
    const parts: string[] = [];

    for (const row of matrix) {
      const cell = row[columnIndex];

      if (
        !cell ||
        /^\d+(?:\.\d+)?$/u.test(cell) ||
        /^из них$/iu.test(cell)
      ) {
        continue;
      }

      if (!parts.includes(cell)) {
        parts.push(cell);
      }
    }

    return parts.join(" ").replace(/\s{2,}/g, " ").trim();
  });
}

function buildTableFromLines(params: {
  title: string;
  description: string | null;
  lines: string[];
}) {
  const normalizedLines = params.lines
    .map(normalizeTextLine)
    .filter((line) => line.length > 0);

  const rowCandidates = normalizedLines
    .map((line) => {
      const cells = parseTabbedCells(line);
      const rowNumberIndices = getRowNumberIndices(cells);
      return {
        line,
        cells,
        rowNumberIndex: rowNumberIndices[0] ?? -1,
        rowNumberIndices,
      };
    })
    .filter((item) => item.rowNumberIndex > 0);

  if (rowCandidates.length === 0) {
    return null;
  }

  const sampleRow =
    rowCandidates.find(
      (item) =>
        item.rowNumberIndices.length === 1 &&
        item.cells.length >= (item.rowNumberIndex + 6),
    ) ?? rowCandidates[0];

  const codeIndex =
    sampleRow.cells[sampleRow.rowNumberIndex + 1] &&
    isCodeFragmentCell(sampleRow.cells[sampleRow.rowNumberIndex + 1])
      ? sampleRow.rowNumberIndex + 1
      : null;

  const serviceColumnsCount = codeIndex === null ? 2 : 3;
  const totalColumns = Math.max(
    ...rowCandidates.slice(0, 25).map((item) => item.cells.length),
  );
  const headerEndIndex = normalizedLines.findIndex((line) => line === sampleRow.line);
  const headerLines = normalizedLines.slice(0, Math.max(headerEndIndex, 0));
  const mergedHeaders = mergeHeaderLabels(headerLines, totalColumns);
  const leadingGraphNumbers = sampleRow.cells
    .slice(0, sampleRow.rowNumberIndex)
    .filter(isPlainNumericCell).length;

  function deriveValueColumnCount() {
    if (leadingGraphNumbers >= 6) {
      return Math.max(leadingGraphNumbers - serviceColumnsCount, 1);
    }

    const cellsAfterCode = sampleRow.cells.slice(sampleRow.rowNumberIndex + serviceColumnsCount);
    let count = 0;

    for (const cell of cellsAfterCode) {
      if (!isValueCell(cell)) {
        break;
      }
      count += 1;
    }

    while (count > 0 && cellsAfterCode[count - 1] === "") {
      count -= 1;
    }

    return Math.max(count, 1);
  }

  const valueColumnCount = deriveValueColumnCount();

  const descriptorColumns: FormTableDescriptorColumn[] = [
    {
      ...createDefaultDescriptorColumn(0),
      key: "row_number",
      label: mergedHeaders[sampleRow.rowNumberIndex] || "№ строки",
      sticky: false,
      width: 120,
    },
  ];

  if (codeIndex !== null) {
    descriptorColumns.push({
      ...createDefaultDescriptorColumn(1),
      key: "reference_code",
      label: mergedHeaders[codeIndex] || "Код",
      width: 160,
      sticky: false,
    });
  }

  const inputColumnStartIndex = serviceColumnsCount;
  const inputColumnLabels = mergedHeaders
    .slice(inputColumnStartIndex)
    .filter((label) => label.length > 0);

  const inputColumnCount = Math.max(
    Math.min(inputColumnLabels.length, valueColumnCount) || valueColumnCount,
    valueColumnCount,
    1,
  );

  const inputColumns = Array.from({ length: inputColumnCount }, (_, index) => {
    const defaultColumn = createDefaultInputColumn(index);
    const label = inputColumnLabels[index] || `Графа ${index + 1}`;

    return {
      ...defaultColumn,
      key: `value_${index + 1}`,
      label,
      width: Math.max(180, Math.min(360, label.length * 9)),
    };
  });

  const tokens = normalizedLines
    .slice(headerEndIndex)
    .flatMap((line) => parseTabbedCells(line));

  let pendingPrefix: string | null = null;
  let pendingLabelParts: string[] = [];
  const rows: FormTableRow[] = [];

  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];

    if (!token) {
      index += 1;
      continue;
    }

    if (!isRowNumberCell(token)) {
      pendingLabelParts.push(token);
      index += 1;
      continue;
    }

    const filteredLabelParts = pendingLabelParts.filter(
      (part) => part && !isPlainNumericCell(part),
    );
    const baseLabel = filteredLabelParts.join(" ").replace(/\s{2,}/g, " ").trim();
    pendingLabelParts = [];

    if (!baseLabel) {
      index += 1;
      continue;
    }

    const row = createDefaultRow(rows.length, descriptorColumns);
    row.label = baseLabel;
    row.key = `${params.title.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, "_")}_${rows.length + 1}`;
    row.groupPrefix = pendingPrefix;
    row.indent = pendingPrefix ? 1 : 0;
    row.descriptorValues[descriptorColumns[0].id] = token.replace(/\.$/u, "") || null;
    pendingPrefix = null;
    index += 1;

    const codeParts: string[] = [];
    while (index < tokens.length && isCodeFragmentCell(tokens[index])) {
      codeParts.push(tokens[index]);
      index += 1;
    }

    if (codeIndex !== null && descriptorColumns[1]) {
      row.descriptorValues[descriptorColumns[1].id] =
        codeParts.join(" ").replace(/\s{2,}/g, " ").trim() || null;
    }

    const values: string[] = [];
    while (index < tokens.length && values.length < valueColumnCount) {
      const valueToken = tokens[index];
      if (!isValueCell(valueToken)) {
        break;
      }
      values.push(valueToken);
      index += 1;
    }

    while (values.length < valueColumnCount) {
      values.push("");
    }

    rows.push(row);

    const trailingParts: string[] = [];
    while (index < tokens.length && !isRowNumberCell(tokens[index])) {
      const trailingToken = tokens[index];

      if (!trailingToken) {
        index += 1;
        continue;
      }

      trailingParts.push(trailingToken);
      index += 1;

      if (
        trailingParts.length === 1 &&
        /^(?:в том числе:?|из них:?|из него:?|в т\.ч\.?|из общего числа|из них,)/iu.test(
          trailingParts[0],
        )
      ) {
        pendingPrefix = trailingParts[0];
        trailingParts.length = 0;
      }
    }

    if (trailingParts.length > 0) {
      pendingLabelParts = trailingParts;
    }
  }

  if (rows.length === 0) {
    return null;
  }

  return {
    title: params.title,
    description: params.description,
    descriptorColumns,
    inputColumns,
    rows,
  } satisfies LegacyTableDraft;
}

function extractTitle(lines: string[], formCode: LegacyFormCode) {
  const titleLine = lines.find((line) => /СВЕДЕНИЯ О/i.test(line));
  return titleLine ?? `Форма № ${formCode}`;
}

function buildTableDraftsFromText(
  text: string,
  formCode: LegacyFormCode,
): LegacyTableDraft[] {
  const lines = text
    .split(/\r?\n/u)
    .map(normalizeTextLine)
    .filter((line) => line.length > 0);

  const tables: LegacyTableDraft[] = [];
  const docTitle = extractTitle(lines, formCode);
  let currentTitle = docTitle;
  let currentDescription: string | null = null;
  let buffer: string[] = [];

  function flushCurrentTable() {
    if (buffer.length === 0) {
      return;
    }

    const parsedTable = buildTableFromLines({
      title: currentTitle,
      description: currentDescription,
      lines: buffer,
    });

    if (parsedTable) {
      tables.push(parsedTable);
    }

    buffer = [];
  }

  for (const line of lines) {
    if (isRomanOrSectionHeading(line)) {
      flushCurrentTable();
      currentTitle = line;
      currentDescription = null;
      continue;
    }

    if (isSubtableHeading(line)) {
      flushCurrentTable();
      currentTitle = currentTitle === docTitle ? line : `${currentTitle} / ${line}`;
      currentDescription = null;
      continue;
    }

    if (!buffer.length && line.length < 120 && !/\t/.test(line)) {
      currentDescription = line;
      continue;
    }

    buffer.push(line);
  }

  flushCurrentTable();

  return tables.length > 0
    ? tables
    : [
        {
          title: docTitle,
          description: null,
          descriptorColumns: [],
          inputColumns: [createDefaultInputColumn(0)],
          rows: [createDefaultRow(0)],
        },
      ];
}

async function extractLegacyDocText(filePath: string) {
  const extractor = new WordExtractor();
  const document = await extractor.extract(filePath);
  return document.getBody() as string;
}

export async function getLegacyFolderSummary(formCode: LegacyFormCode) {
  const folderPath = path.join(getLegacyFormsRoot(), LEGACY_FORM_DIRECTORIES[formCode]);
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".doc"));

  return {
    formCode,
    folderPath,
    fileCount: files.length,
    sampleFileName: files[0]?.name ?? null,
  };
}

export async function importLegacyFormSchema(params: {
  formCode: LegacyFormCode;
  reportingYear: number;
  title: string;
}) {
  const folderPath = path.join(getLegacyFormsRoot(), LEGACY_FORM_DIRECTORIES[params.formCode]);
  const files = await fs.readdir(folderPath, { withFileTypes: true });
  const firstDoc = files.find(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".doc"),
  );

  if (!firstDoc) {
    throw new Error(`В папке ${LEGACY_FORM_DIRECTORIES[params.formCode]} не найдено .doc файлов.`);
  }

  const body = await extractLegacyDocText(path.join(folderPath, firstDoc.name));
  const tables = buildTableDraftsFromText(body, params.formCode);

  return normalizeFormSchema({
    meta: {
      formCode: params.formCode,
      title: params.title,
      reportingYear: params.reportingYear,
      description: `Импорт структуры из реального архива 2024 (${firstDoc.name}).`,
    },
    headerFields: [
      {
        id: "header_region_name",
        key: "region_name",
        label: "Регион",
        fieldType: "text",
        required: true,
        placeholder: "Наименование региона",
        helpText: null,
        options: [],
        validation: {},
      },
      {
        id: "header_organization_name",
        key: "organization_name",
        label: "Наименование организации",
        fieldType: "text",
        required: true,
        placeholder: "Полное наименование",
        helpText: null,
        options: [],
        validation: {},
      },
      {
        id: "header_postal_address",
        key: "postal_address",
        label: "Почтовый адрес",
        fieldType: "textarea",
        required: false,
        placeholder: "Адрес организации",
        helpText: null,
        options: [],
        validation: {},
      },
    ],
    tables: tables.map((table, index) => {
      const descriptorIdMap = new Map<string, string>();
      const descriptorColumns = table.descriptorColumns.map((column, columnIndex) => {
        const nextId = `descriptor_${index + 1}_${columnIndex + 1}`;
        descriptorIdMap.set(column.id, nextId);

        return {
          ...column,
          id: nextId,
        };
      });

      return {
        id: `table_${index + 1}`,
        title: table.title,
        description: table.description,
        descriptorColumns,
        columns: table.inputColumns.map((column, columnIndex) => ({
          ...column,
          id: `column_${index + 1}_${columnIndex + 1}`,
          key: `${column.key}_${index + 1}`,
        })),
        rows: table.rows.map((row) => ({
          ...row,
          descriptorValues: Object.fromEntries(
            Object.entries(row.descriptorValues ?? {}).map(([descriptorId, value]) => [
              descriptorIdMap.get(descriptorId) ?? descriptorId,
              value,
            ]),
          ),
        })),
        settings: {
          stickyHeader: true,
          stickyFirstColumn: true,
          horizontalScroll: true,
        },
      };
    }),
  } satisfies FormBuilderSchema);
}

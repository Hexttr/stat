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

export const legacyFormDirectories = {
  F12: "2024_F12",
  F14: "2024_F14",
  F19: "2024_F19",
  F30: "2024_F30",
  F47: "F47",
} as const;

export const legacyFormCodes = Object.keys(legacyFormDirectories) as Array<
  keyof typeof legacyFormDirectories
>;

export type LegacyFormCode = keyof typeof legacyFormDirectories;

export function isLegacyFormCode(value: string): value is LegacyFormCode {
  return legacyFormCodes.includes(value as LegacyFormCode);
}

type LegacyTableDraft = {
  title: string;
  description: string | null;
  descriptorColumns: FormTableDescriptorColumn[];
  inputColumns: ReturnType<typeof createDefaultInputColumn>[];
  rows: FormTableRow[];
};

type LegacyDraftBuildResult = {
  tables: LegacyTableDraft[];
  fallbackUsed: boolean;
  warnings: string[];
};

type LegacyLineInfo = {
  line: string;
  lineIndex: number;
  cells: string[];
  rowNumberIndices: number[];
  rowNumberIndex: number;
  dataCellStartIndex: number;
};

type LegacyDocCandidate = {
  name: string;
  filePath: string;
  size: number;
};

type LegacyDocAnalysis = {
  fileName: string;
  filePath: string;
  fileCount: number;
  folderPath: string;
  size: number;
  textLength: number;
  tableCount: number;
  totalRows: number;
  totalValueColumns: number;
  totalDescriptorColumns: number;
  fallbackUsed: boolean;
  warnings: string[];
  qualityScore: number;
  tables: LegacyTableDraft[];
};

export type LegacyImportDiagnostics = {
  formCode: LegacyFormCode;
  folderPath: string;
  fileCount: number;
  selectedFileName: string;
  candidateFiles: string[];
  tableCount: number;
  totalRows: number;
  totalValueColumns: number;
  totalDescriptorColumns: number;
  fallbackUsed: boolean;
  warnings: string[];
};

export type LegacyImportResult = {
  schema: FormBuilderSchema;
  diagnostics: LegacyImportDiagnostics;
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

function isSimpleIntegerCell(value: string) {
  return /^\d+$/u.test(value.trim());
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

  return /^(?:\d[\d\s]*(?:[.,]\d+)?%?|[XХхx-]|—)$/u.test(normalized);
}

function getRowNumberIndices(cells: string[]) {
  return cells.reduce<number[]>((accumulator, cell, index) => {
    if (isRowNumberCell(cell)) {
      accumulator.push(index);
      return accumulator;
    }

    const hasLeadingText =
      index > 0 &&
      cells
        .slice(0, index)
        .some((candidate) => candidate && !isPlainNumericCell(candidate) && !/^№$/u.test(candidate));
    const nextCells = cells.slice(index + 1, index + 4);
    const looksLikeDataRow =
      nextCells.length > 0 &&
      nextCells.some(
        (candidate) =>
          candidate === "" || isValueCell(candidate) || isCodeFragmentCell(candidate),
      );

    if (
      isSimpleIntegerCell(cell) &&
      index <= 2 &&
      hasLeadingText &&
      looksLikeDataRow &&
      !/^(?:№|строки|стр\.|стро-?ки)$/iu.test(cells[index - 1] ?? "")
    ) {
      accumulator.push(index);
    }

    return accumulator;
  }, []);
}

function getSimpleRowNumberIndicesInRange(cells: string[], startIndex: number) {
  const matches: number[] = [];

  for (let index = startIndex; index < cells.length; index += 1) {
    const cell = cells[index];

    if (!isSimpleIntegerCell(cell)) {
      continue;
    }

    const previousCell = cells[index - 1] ?? "";
    const nextCells = cells.slice(index + 1, index + 5);
    const hasLabelBefore =
      previousCell.length > 0 &&
      !isPlainNumericCell(previousCell) &&
      !isValueCell(previousCell) &&
      !/^№$/u.test(previousCell);
    const looksLikeDataRow =
      nextCells.length > 0 &&
      nextCells.some((candidate) => candidate === "" || isValueCell(candidate));

    if (hasLabelBefore && looksLikeDataRow) {
      matches.push(index);
    }
  }

  return matches;
}

function createLineInfo(line: string, lineIndex: number): LegacyLineInfo {
  const cells = parseTabbedCells(line);
  const graphRun = detectLeadingGraphRun(cells);
  const numericRowIndices = getRowNumberIndices(cells).filter(
    (index) => index > (graphRun?.endIndex ?? -1),
  );
  const simpleRowIndices = graphRun
    ? getSimpleRowNumberIndicesInRange(cells, graphRun.endIndex + 1)
    : [];
  const rowNumberIndices = [...new Set([...numericRowIndices, ...simpleRowIndices])].sort(
    (left, right) => left - right,
  );

  return {
    line,
    lineIndex,
    cells,
    rowNumberIndices,
    rowNumberIndex: rowNumberIndices[0] ?? -1,
    dataCellStartIndex: graphRun ? graphRun.endIndex + 1 : 0,
  };
}

function detectLeadingGraphRun(cells: string[]) {
  for (let startIndex = 0; startIndex < cells.length; startIndex += 1) {
    if (cells[startIndex] !== "1") {
      continue;
    }

    let current = 1;
    let endIndex = startIndex;

    while (endIndex + 1 < cells.length) {
      const nextValue = cells[endIndex + 1];
      if (!isSimpleIntegerCell(nextValue) || Number(nextValue) !== current + 1) {
        break;
      }
      current += 1;
      endIndex += 1;
    }

    if (current < 4) {
      continue;
    }

    const hasTextAfterRun = cells
      .slice(endIndex + 1)
      .some((cell) => cell && !isPlainNumericCell(cell) && !isValueCell(cell));

    if (!hasTextAfterRun) {
      continue;
    }

    return {
      startIndex,
      endIndex,
    };
  }

  return null;
}

function getValueStartIndex(rowNumberIndex: number, hasCode: boolean) {
  return rowNumberIndex + 1 + (hasCode ? 1 : 0);
}

function dedupeParts(parts: string[]) {
  const result: string[] = [];

  for (const part of parts) {
    if (!part || result.includes(part)) {
      continue;
    }

    result.push(part);
  }

  return result;
}

function trimTitleDepth(title: string, formCode: LegacyFormCode) {
  const maxDepth =
    formCode === "F30" || formCode === "F47"
      ? 4
      : formCode === "F14"
        ? 3
        : 2;
  const segments = dedupeParts(
    title
      .split(" / ")
      .map((segment) => segment.trim())
      .filter(Boolean),
  );

  return segments.slice(-maxDepth).join(" / ");
}

function trimEmbeddedHeaderNoise(label: string | null | undefined) {
  if (!label) {
    return "";
  }

  let next = label.replace(/\s{2,}/g, " ").trim();

  next = next.replace(/\(\d{3,4}\)\s*продолжение/giu, "").trim();

  const headerMarkers = [
    /Наименование(?:\s+организаций)?/iu,
    /№\s*(?:строки|стр\.|стро-ки)/iu,
    /Код\s+(?:МКБ-10|по)/iu,
    /продолжение/iu,
  ];

  for (const marker of headerMarkers) {
    const matchIndex = next.search(marker);
    if (matchIndex > 0) {
      next = next.slice(0, matchIndex).trim();
    }
  }

  return next.replace(/\s{2,}/g, " ").trim();
}

function normalizeRowLabel(label: string) {
  return trimEmbeddedHeaderNoise(
    label
      .replace(/\bX\b/gu, "X")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

function normalizeDescriptorLabel(label: string, fallback: string) {
  const next = trimEmbeddedHeaderNoise(label);
  if (
    !next ||
    next.length > 48 ||
    /(?:Наименование|Код по ОКЕИ|продолжение|подчине-ния|подчинения|сельской местности)/iu.test(
      next,
    )
  ) {
    return fallback;
  }

  return next;
}

function normalizeInputLabel(label: string, index: number) {
  const next = trimEmbeddedHeaderNoise(label);

  if (
    !next ||
    next.length > 80 ||
    /(?:Наименование|Код по ОКЕИ|продолжение)/iu.test(next)
  ) {
    return `Графа ${index + 1}`;
  }

  return next;
}

function trimToKnownRowStart(label: string, markers: string[]) {
  const candidateIndex = markers
    .map((marker) => label.indexOf(marker))
    .filter((index) => index > 0)
    .sort((left, right) => left - right)[0];

  return typeof candidateIndex === "number" ? label.slice(candidateIndex).trim() : label;
}

function getKnownRowStarts(formCode: LegacyFormCode) {
  const knownStartsByForm: Partial<Record<LegacyFormCode, string[]>> = {
    F47: [
      "Краевые, республиканские, областные, окружные больницы",
      "Детские краевые, республиканские, областные, окружные больницы",
      "Городские больницы",
      "Детские городские больницы",
      "Городские больницы скорой медицинской помощи",
      "Специализированные больницы",
      "Районные больницы центральные",
      "Районные больницы",
      "Участковые больницы",
      "Родильные дома",
      "Госпитали",
      "Медико-санитарные части",
      "Хосписы",
      "Центры, всего",
      "Амбулатории",
      "Поликлиники",
      "Детские поликлиники",
    ],
    F30: [
      "Акушерско-гинекологические",
      "Аллергологические",
      "Амбулатории",
      "Аптеки",
      "Восстановительного лечения",
      "Диабетологические",
      "Дистанционно-диагностические кабинеты",
      "Дневные стационары для взрослых",
      "Дневные стационары для детей",
      "Женские консультации",
      "Здравпункты врачебные",
      "Здравпункты фельдшерские",
      "Консультативно-диагностические центры",
      "Консультативно-диагностические центры для детей",
      "Консультативно-оздоровительные отделы",
      "Лаборатории",
    ],
  };

  return knownStartsByForm[formCode] ?? [];
}

function normalizeRowsForForm(formCode: LegacyFormCode, rows: FormTableRow[]) {
  const knownStarts = getKnownRowStarts(formCode);

  return rows
    .map((row) => {
      let label = normalizeRowLabel(row.label);

      if (knownStarts.length > 0) {
        label = trimToKnownRowStart(label, knownStarts);
      }

      return {
        ...row,
        label,
        groupPrefix: row.groupPrefix ? trimEmbeddedHeaderNoise(row.groupPrefix) : row.groupPrefix,
      };
    })
    .filter(
      (row) =>
        row.label.length > 0 &&
        !/^Наименование(?:\s+организаций)?$/iu.test(row.label) &&
        row.label !== "«Новой модели медицинской организации»" &&
        row.label !== "X",
    );
}

function normalizeDescriptorColumnsForForm(
  formCode: LegacyFormCode,
  descriptorColumns: FormTableDescriptorColumn[],
) {
  return descriptorColumns.map((column, index) => {
    let fallback = index === 0 ? "№ строки" : "Код";

    if (formCode === "F19" && index === 1) {
      fallback = "Код МКБ-10";
    }

    if (index === 0) {
      return {
        ...column,
        label: "№ строки",
      };
    }

    if (index === 1 && ["F12", "F14", "F19"].includes(formCode)) {
      return {
        ...column,
        label: fallback,
      };
    }

    return {
      ...column,
      label: normalizeDescriptorLabel(column.label, fallback),
    };
  });
}

function calculateQualityScore(params: {
  formCode: LegacyFormCode;
  textLength: number;
  tableCount: number;
  totalRows: number;
  totalValueColumns: number;
  fallbackUsed: boolean;
  tables: LegacyTableDraft[];
}) {
  const rowLabels = params.tables.flatMap((table) => table.rows.map((row) => row.label));
  const descriptorLabels = params.tables.flatMap((table) =>
    table.descriptorColumns.map((column) => column.label),
  );
  const knownStarts = getKnownRowStarts(params.formCode);
  const mergedMarkerPenalty = rowLabels.reduce((sum, label) => {
    if (knownStarts.length === 0) {
      return sum;
    }

    const hits = knownStarts.filter((marker) => label.includes(marker)).length;
    return sum + Math.max(0, hits - 1) * 120;
  }, 0);
  const headerRowPenalty = rowLabels.filter((label) => /^Наименование(?:\s+организаций)?$/iu.test(label))
    .length * 250;
  const longRowPenalty = rowLabels.filter((label) => label.length > 160).length * 90;
  const veryLongRowPenalty = rowLabels.filter((label) => label.length > 320).length * 180;
  const noisyDescriptorPenalty = descriptorLabels.filter(
    (label) =>
      label.length > 48 ||
      /(?:Наименование|продолжение|Код по ОКЕИ|подчине-ния|подчинения|сельской местности)/iu.test(
        label,
      ),
  ).length * 55;
  const graphPenalty = params.tables
    .flatMap((table) => table.inputColumns.map((column) => column.label))
    .filter((label) => /^Графа\s+\d+$/u.test(label))
    .length * 8;

  return (
    params.tableCount * 120 +
    params.totalRows * 10 +
    params.totalValueColumns * 4 +
    Math.floor(params.textLength / 200) -
    mergedMarkerPenalty -
    headerRowPenalty -
    longRowPenalty -
    veryLongRowPenalty -
    noisyDescriptorPenalty -
    graphPenalty -
    (params.fallbackUsed ? 10_000 : 0)
  );
}

function applyFormSpecificNormalizers(
  formCode: LegacyFormCode,
  tables: LegacyTableDraft[],
): LegacyTableDraft[] {
  return tables.map((table) => ({
    ...table,
    title: trimTitleDepth(table.title, formCode),
    description: table.description ? trimEmbeddedHeaderNoise(table.description) : table.description,
    descriptorColumns: normalizeDescriptorColumnsForForm(formCode, table.descriptorColumns),
    rows: normalizeRowsForForm(formCode, table.rows),
  }));
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
  const normalizedLines = params.lines.map(normalizeTextLine).filter((line) => line.length > 0);
  const lineInfos = normalizedLines.map((line, lineIndex) => createLineInfo(line, lineIndex));
  const rowCandidates = lineInfos.filter((item) => item.rowNumberIndex >= 0);

  if (rowCandidates.length === 0) {
    return null;
  }

  const firstDataLineIndex = rowCandidates[0]?.lineIndex ?? 0;
  const sampleRows = rowCandidates.slice(0, 15);
  const sampleRow =
    [...sampleRows]
      .sort((left, right) => {
        const leftHasCode = Boolean(
          left.cells[left.rowNumberIndex + 1] &&
            isCodeFragmentCell(left.cells[left.rowNumberIndex + 1]),
        );
        const rightHasCode = Boolean(
          right.cells[right.rowNumberIndex + 1] &&
            isCodeFragmentCell(right.cells[right.rowNumberIndex + 1]),
        );
        const leftValueStart = getValueStartIndex(left.rowNumberIndex, leftHasCode);
        const rightValueStart = getValueStartIndex(right.rowNumberIndex, rightHasCode);
        const leftValueLikeCount = left.cells.slice(leftValueStart).filter(isValueCell).length;
        const rightValueLikeCount = right.cells.slice(rightValueStart).filter(isValueCell).length;
        const leftScore = leftValueLikeCount * 5 + left.cells.length - left.rowNumberIndex;
        const rightScore = rightValueLikeCount * 5 + right.cells.length - right.rowNumberIndex;
        return rightScore - leftScore;
      })[0] ?? rowCandidates[0];

  const hasCode =
    sampleRows.filter(
      (item) =>
        item.cells[item.rowNumberIndex + 1] &&
        isCodeFragmentCell(item.cells[item.rowNumberIndex + 1]),
    ).length >= Math.max(1, Math.floor(sampleRows.length / 3));
  const codeIndex = hasCode ? sampleRow.rowNumberIndex + 1 : null;
  const valueStartIndex = getValueStartIndex(sampleRow.rowNumberIndex, hasCode);
  const totalColumns = Math.max(...rowCandidates.slice(0, 25).map((item) => item.cells.length));
  const headerWindowStart = Math.max(0, firstDataLineIndex - 10);
  const headerLines = lineInfos
    .slice(headerWindowStart, firstDataLineIndex)
    .filter((item) => item.rowNumberIndex < 0 && /\t/.test(item.line))
    .map((item) => item.line);
  const mergedHeaders = mergeHeaderLabels(headerLines, totalColumns);

  const valueColumnCandidates = sampleRows
    .map((item) => {
      const startIndex = getValueStartIndex(item.rowNumberIndex, hasCode);
      const cellsAfterDescriptors = item.cells.slice(startIndex);
      let count = 0;

      for (const cell of cellsAfterDescriptors) {
        if (!cell) {
          count += 1;
          continue;
        }

        if (!isValueCell(cell)) {
          break;
        }

        count += 1;
      }

      while (count > 0 && !cellsAfterDescriptors[count - 1]) {
        count -= 1;
      }

      return count;
    })
    .filter((count) => count > 0);

  const valueColumnCount = Math.max(...valueColumnCandidates, 1);

  const descriptorColumns: FormTableDescriptorColumn[] = [
    {
      ...createDefaultDescriptorColumn(0),
      key: "row_number",
      label: normalizeDescriptorLabel(mergedHeaders[sampleRow.rowNumberIndex], "№ строки"),
      sticky: false,
      width: 120,
    },
  ];

  if (codeIndex !== null) {
    descriptorColumns.push({
      ...createDefaultDescriptorColumn(1),
      key: "reference_code",
      label: normalizeDescriptorLabel(mergedHeaders[codeIndex], "Код"),
      width: 160,
      sticky: false,
    });
  }

  const inputColumns = Array.from({ length: valueColumnCount }, (_, index) => {
    const defaultColumn = createDefaultInputColumn(index);
    const label = normalizeInputLabel(mergedHeaders[valueStartIndex + index], index);

    return {
      ...defaultColumn,
      key: `value_${index + 1}`,
      label,
      width: Math.max(180, Math.min(360, label.length * 9)),
    };
  });

  const dataLines = lineInfos.slice(firstDataLineIndex);
  let pendingPrefix: string | null = null;
  let pendingLabelParts: string[] = [];
  const rows: FormTableRow[] = [];
  let lineIndex = 0;

  while (lineIndex < dataLines.length) {
    const currentLine = dataLines[lineIndex];

    if (currentLine.rowNumberIndex < 0) {
      pendingLabelParts.push(...currentLine.cells.filter(Boolean));
      lineIndex += 1;
      continue;
    }

    let inlinePendingLabelParts = pendingLabelParts;
    const trailingParts: string[] = [];
    pendingLabelParts = [];

    for (let rowPosition = 0; rowPosition < currentLine.rowNumberIndices.length; rowPosition += 1) {
      const rowNumberIndex = currentLine.rowNumberIndices[rowPosition];
      const nextRowNumberIndex = currentLine.rowNumberIndices[rowPosition + 1] ?? currentLine.cells.length;
      const currentLabelParts = (
        rowPosition === 0
          ? [
              ...inlinePendingLabelParts,
              ...currentLine.cells
                .slice(currentLine.dataCellStartIndex, rowNumberIndex)
                .filter(Boolean),
            ]
          : [...inlinePendingLabelParts]
      ).filter(
        (part) => part && !isPlainNumericCell(part),
      );
      const rowNumberToken = currentLine.cells[rowNumberIndex];
      const baseLabel = normalizeRowLabel(
        currentLabelParts.join(" ").replace(/\s{2,}/g, " ").trim(),
      );

      inlinePendingLabelParts = [];

      if (!rowNumberToken || !baseLabel) {
        continue;
      }

      const row = createDefaultRow(rows.length, descriptorColumns);
      row.label = baseLabel;
      row.key = `${params.title.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, "_")}_${rows.length + 1}`;
      row.groupPrefix = pendingPrefix;
      row.indent = pendingPrefix ? 1 : 0;
      row.descriptorValues[descriptorColumns[0].id] = rowNumberToken.replace(/\.$/u, "") || null;
      pendingPrefix = null;

      let cellIndex = rowNumberIndex + 1;
      const codeParts: string[] = [];

      if (hasCode && codeIndex !== null) {
        while (
          cellIndex < nextRowNumberIndex &&
          isCodeFragmentCell(currentLine.cells[cellIndex])
        ) {
          codeParts.push(currentLine.cells[cellIndex]);
          cellIndex += 1;
        }
      }

      if (codeIndex !== null && descriptorColumns[1]) {
        row.descriptorValues[descriptorColumns[1].id] =
          codeParts.join(" ").replace(/\s{2,}/g, " ").trim() || null;
      }

      const values: string[] = [];
      while (cellIndex < nextRowNumberIndex && values.length < valueColumnCount) {
        const valueToken = currentLine.cells[cellIndex];

        if (!valueToken) {
          values.push("");
          cellIndex += 1;
          continue;
        }

        if (!isValueCell(valueToken)) {
          break;
        }

        values.push(valueToken);
        cellIndex += 1;
      }

      const segmentTrailingParts = currentLine.cells
        .slice(cellIndex, nextRowNumberIndex)
        .filter(Boolean);

      while (values.length < valueColumnCount) {
        values.push("");
      }

      rows.push(row);

      if (rowPosition < currentLine.rowNumberIndices.length - 1) {
        inlinePendingLabelParts = segmentTrailingParts;
      } else {
        trailingParts.push(...segmentTrailingParts);
      }
    }

    lineIndex += 1;

    while (lineIndex < dataLines.length && dataLines[lineIndex].rowNumberIndex < 0) {
      const continuationParts = dataLines[lineIndex].cells.filter(Boolean);

      if (continuationParts.length > 0 && !continuationParts.every((part) => isValueCell(part))) {
        trailingParts.push(...continuationParts);
      }

      lineIndex += 1;
    }

    if (
      trailingParts.length === 1 &&
      /^(?:в том числе:?|из них:?|из него:?|в т\.ч\.?|из общего числа|из них,)/iu.test(
        trailingParts[0],
      )
    ) {
      pendingPrefix = trailingParts[0];
      continue;
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
): LegacyDraftBuildResult {
  const lines = text
    .split(/\r?\n/u)
    .map(normalizeTextLine)
    .filter((line) => line.length > 0);

  const tables: LegacyTableDraft[] = [];
  const warnings: string[] = [];
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

  if (tables.length > 0) {
    return {
      tables: applyFormSpecificNormalizers(formCode, tables),
      fallbackUsed: false,
      warnings,
    };
  }

  warnings.push("Не удалось уверенно выделить таблицы, создана минимальная fallback-структура.");

  return {
    tables: [
      {
        title: docTitle,
        description: null,
        descriptorColumns: [],
        inputColumns: [createDefaultInputColumn(0)],
        rows: [createDefaultRow(0)],
      },
    ],
    fallbackUsed: true,
    warnings,
  };
}

async function extractLegacyDocText(filePath: string) {
  const extractor = new WordExtractor();
  const document = await extractor.extract(filePath);
  return document.getBody() as string;
}

async function listLegacyDocCandidates(formCode: LegacyFormCode) {
  const folderPath = path.join(getLegacyFormsRoot(), legacyFormDirectories[formCode]);
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const docs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".doc"))
      .map(async (entry) => {
        const filePath = path.join(folderPath, entry.name);
        const stat = await fs.stat(filePath);

        return {
          name: entry.name,
          filePath,
          size: stat.size,
        } satisfies LegacyDocCandidate;
      }),
  );

  docs.sort((left, right) => right.size - left.size || left.name.localeCompare(right.name, "ru"));

  return {
    folderPath,
    docs,
  };
}

function pickRepresentativeCandidates(docs: LegacyDocCandidate[]) {
  const candidates: LegacyDocCandidate[] = [];
  const candidateIndices = [0, 1, 2, Math.floor(docs.length / 2), docs.length - 1].filter(
    (index, position, indices) => index >= 0 && index < docs.length && indices.indexOf(index) === position,
  );

  for (const index of candidateIndices) {
    candidates.push(docs[index]);
  }

  for (const doc of docs.slice(0, 12)) {
    if (!candidates.some((candidate) => candidate.filePath === doc.filePath)) {
      candidates.push(doc);
    }
  }

  return candidates;
}

async function analyzeLegacyDocCandidate(params: {
  formCode: LegacyFormCode;
  candidate: LegacyDocCandidate;
  fileCount: number;
  folderPath: string;
}): Promise<LegacyDocAnalysis> {
  const body = await extractLegacyDocText(params.candidate.filePath);
  const buildResult = buildTableDraftsFromText(body, params.formCode);
  const tableCount = buildResult.tables.length;
  const totalRows = buildResult.tables.reduce((sum, table) => sum + table.rows.length, 0);
  const totalValueColumns = buildResult.tables.reduce((sum, table) => sum + table.inputColumns.length, 0);
  const totalDescriptorColumns = buildResult.tables.reduce(
    (sum, table) => sum + table.descriptorColumns.length,
    0,
  );
  const qualityScore = calculateQualityScore({
    formCode: params.formCode,
    textLength: body.length,
    tableCount,
    totalRows,
    totalValueColumns,
    fallbackUsed: buildResult.fallbackUsed,
    tables: buildResult.tables,
  });

  return {
    fileName: params.candidate.name,
    filePath: params.candidate.filePath,
    fileCount: params.fileCount,
    folderPath: params.folderPath,
    size: params.candidate.size,
    textLength: body.length,
    tableCount,
    totalRows,
    totalValueColumns,
    totalDescriptorColumns,
    fallbackUsed: buildResult.fallbackUsed,
    warnings: buildResult.warnings,
    qualityScore,
    tables: buildResult.tables,
  };
}

async function selectRepresentativeLegacyDoc(formCode: LegacyFormCode) {
  const { folderPath, docs } = await listLegacyDocCandidates(formCode);

  if (docs.length === 0) {
    throw new Error(`В папке ${legacyFormDirectories[formCode]} не найдено .doc файлов.`);
  }

  const candidateDocs = pickRepresentativeCandidates(docs);
  const analyses = await Promise.all(
    candidateDocs.map((candidate) =>
      analyzeLegacyDocCandidate({
        formCode,
        candidate,
        fileCount: docs.length,
        folderPath,
      }),
    ),
  );

  analyses.sort(
    (left, right) =>
      right.qualityScore - left.qualityScore ||
      right.tableCount - left.tableCount ||
      right.totalRows - left.totalRows ||
      right.textLength - left.textLength ||
      left.fileName.localeCompare(right.fileName, "ru"),
  );

  return {
    selected: analyses[0],
    candidateFiles: candidateDocs.map((candidate) => candidate.name),
    fileCount: docs.length,
    folderPath,
  };
}

export async function getLegacyFolderSummary(formCode: LegacyFormCode) {
  const selection = await selectRepresentativeLegacyDoc(formCode);

  return {
    formCode,
    folderPath: selection.folderPath,
    fileCount: selection.fileCount,
    sampleFileName: selection.selected.fileName,
    tableCount: selection.selected.tableCount,
    totalRows: selection.selected.totalRows,
    fallbackUsed: selection.selected.fallbackUsed,
  };
}

export async function importLegacyFormBundle(params: {
  formCode: LegacyFormCode;
  reportingYear: number;
  title: string;
}): Promise<LegacyImportResult> {
  const selection = await selectRepresentativeLegacyDoc(params.formCode);
  const schema = normalizeFormSchema({
    meta: {
      formCode: params.formCode,
      title: params.title,
      reportingYear: params.reportingYear,
      description: `Импорт структуры из реального архива 2024 (${selection.selected.fileName}).`,
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
    tables: selection.selected.tables.map((table, index) => {
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

  return {
    schema,
    diagnostics: {
      formCode: params.formCode,
      folderPath: selection.folderPath,
      fileCount: selection.fileCount,
      selectedFileName: selection.selected.fileName,
      candidateFiles: selection.candidateFiles,
      tableCount: selection.selected.tableCount,
      totalRows: selection.selected.totalRows,
      totalValueColumns: selection.selected.totalValueColumns,
      totalDescriptorColumns: selection.selected.totalDescriptorColumns,
      fallbackUsed: selection.selected.fallbackUsed,
      warnings: selection.selected.warnings,
    },
  };
}

export async function importLegacyFormSchema(params: {
  formCode: LegacyFormCode;
  reportingYear: number;
  title: string;
}) {
  const result = await importLegacyFormBundle(params);
  return result.schema;
}

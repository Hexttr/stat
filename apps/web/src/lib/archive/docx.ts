import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { normalizeCanonText } from "./handoff";

export const CANONICAL_DOCX_BATCH_NAME = "canonical-docx-archive";

const DEFAULT_DOCX_ROOTS = [
  "C:\\python_projects\\statforms_raw",
  "C:\\python_projects\\statforms_docx_2024",
] as const;

const DOCX_VALUE_EXTRACTOR_PATH = path.resolve(
  process.cwd(),
  "..",
  "..",
  "db",
  "handoff_it_20260209",
  "05_tools",
  "tools",
  "extract_docx_values_csv.py",
);

const DOCX_PASSPORT_EXTRACTOR_PATH = path.resolve(
  process.cwd(),
  "..",
  "..",
  "db",
  "handoff_it_20260209",
  "05_tools",
  "tools",
  "build_passport_from_docx.py",
);

type CsvRow = Record<string, string>;

export type CanonicalDocxRegistryEntry = {
  sourcePath: string;
  year: number;
  formCode: string;
  regionNameCandidate: string | null;
  regionMatchKey: string | null;
  code4: string | null;
  code5: string | null;
  originalName: string;
  checksumSha256: string;
  sourceKind: "statforms_raw" | "statforms_docx";
};

export type CanonicalDocxExtractedRow = {
  source_doc: string;
  form: string;
  year: number;
  xml_tag: string;
  value_raw: string | null;
  table_code: string | null;
  table_title: string | null;
  row_no: string | null;
  row_label: string | null;
  col_no: string | null;
  col_label: string | null;
  tbl_seq: string | null;
  grid_r: string | null;
  grid_c: string | null;
};

export type CanonicalDocxExtractionResult = {
  rows: CanonicalDocxExtractedRow[];
  structureSignature: string;
  structureStats: {
    valueRows: number;
    passportRows: number;
    mergedRows: number;
    uniqueTags: number;
    tableCodes: number;
  };
};

function parseCsvContent(input: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

async function readCsvRows(filePath: string) {
  const content = await readFile(filePath, "utf8");
  const parsedRows = parseCsvContent(content);
  const [headers, ...dataRows] = parsedRows;

  if (!headers || headers.length === 0) {
    return [] as CsvRow[];
  }

  return dataRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listDocxFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });

  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listDocxFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.toLowerCase().endsWith(".docx")) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function getCanonicalDocxRoots() {
  const configuredRoots = process.env.CANONICAL_DOCX_ROOTS
    ? process.env.CANONICAL_DOCX_ROOTS.split(path.delimiter).filter(Boolean)
    : [...DEFAULT_DOCX_ROOTS];

  const existingRoots: string[] = [];

  for (const root of configuredRoots) {
    if (await pathExists(root)) {
      existingRoots.push(root);
    }
  }

  return existingRoots;
}

function inferYearFromPath(filePath: string) {
  for (const segment of filePath.split(path.sep)) {
    if (/^20\d{2}$/.test(segment)) {
      return Number(segment);
    }

    const match = segment.match(/(20\d{2})/);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function inferFormCodeFromPath(filePath: string) {
  for (const segment of filePath.split(path.sep)) {
    if (/^F\d+$/i.test(segment)) {
      return segment.toUpperCase();
    }
  }

  const fileName = path.basename(filePath, path.extname(filePath));
  const suffixMatch = fileName.match(/_(\d{2})$/);
  if (suffixMatch) {
    return `F${suffixMatch[1]}`;
  }

  const longSuffixMatch = fileName.match(/_(\d{5})$/);
  if (longSuffixMatch) {
    const code = longSuffixMatch[1].slice(0, 2);
    return `F${code}`;
  }

  return null;
}

function extractRegionNameCandidate(filePath: string) {
  const fileName = path.basename(filePath, path.extname(filePath));
  const withoutTechnicalSuffix = fileName.replace(/(?:_\d{2,5})+$/u, "");
  const normalized = withoutTechnicalSuffix.replace(/_/g, " ").replace(/\s+/g, " ").trim();

  return normalized.length > 0 ? normalized : null;
}

function extractCode4(filePath: string) {
  const fileName = path.basename(filePath, path.extname(filePath));
  const match = fileName.match(/_(\d{4})_\d{5}(?:_\d{2})?$/u);
  return match?.[1] ?? null;
}

function extractCode5(filePath: string) {
  const fileName = path.basename(filePath, path.extname(filePath));
  const match = fileName.match(/_\d{4}_(\d{5})(?:_\d{2})?$/u);
  return match?.[1] ?? null;
}

async function computeSha256(filePath: string) {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });

  return hash.digest("hex");
}

function createStructureSignature(rows: CanonicalDocxExtractedRow[]) {
  const payload = rows
    .map((row) =>
      [
        row.xml_tag,
        row.table_code ?? "",
        row.table_title ?? "",
        row.row_no ?? "",
        row.row_label ?? "",
        row.col_no ?? "",
        row.col_label ?? "",
      ].join("|"),
    )
    .sort()
    .join("\n");

  return createHash("sha1").update(payload).digest("hex");
}

async function runPythonScript(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("python", args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Python extractor failed with code ${code}.${stdout ? `\n${stdout}` : ""}${stderr ? `\n${stderr}` : ""}`,
        ),
      );
    });
  });
}

export async function scanCanonicalDocxArchive() {
  const roots = await getCanonicalDocxRoots();
  const files = (
    await Promise.all(
      roots.map(async (root) => {
        const rootFiles = await listDocxFiles(root);
        return rootFiles.map((filePath) => ({
          filePath,
          root,
        }));
      }),
    )
  ).flat();

  const entries: CanonicalDocxRegistryEntry[] = [];

  for (const { filePath, root } of files) {
    const year = inferYearFromPath(filePath);
    const formCode = inferFormCodeFromPath(filePath);

    if (!year || !formCode) {
      continue;
    }

    const regionNameCandidate = extractRegionNameCandidate(filePath);
    const checksumSha256 = await computeSha256(filePath);

    entries.push({
      sourcePath: filePath,
      year,
      formCode,
      regionNameCandidate,
      regionMatchKey: regionNameCandidate ? normalizeCanonText(regionNameCandidate) : null,
      code4: extractCode4(filePath),
      code5: extractCode5(filePath),
      originalName: path.basename(filePath),
      checksumSha256,
      sourceKind: root.toLowerCase().includes("statforms_raw") ? "statforms_raw" : "statforms_docx",
    });
  }

  return entries.sort((left, right) =>
    left.year - right.year ||
    left.formCode.localeCompare(right.formCode) ||
    left.sourcePath.localeCompare(right.sourcePath),
  );
}

export async function extractCanonicalDocxRows(params: {
  filePath: string;
  formCode: string;
  year: number;
}) {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "stat-docx-"));
  const valuesCsvPath = path.join(tempDirectory, "values.csv");
  const passportCsvPath = path.join(tempDirectory, "passport.csv");

  try {
    await runPythonScript([
      DOCX_VALUE_EXTRACTOR_PATH,
      "--file",
      params.filePath,
      "--out",
      valuesCsvPath,
    ]);
    await runPythonScript([
      DOCX_PASSPORT_EXTRACTOR_PATH,
      "--docx",
      params.filePath,
      "--out",
      passportCsvPath,
      "--form",
      params.formCode,
      "--year",
      String(params.year),
    ]);

    const [valueRows, passportRows] = await Promise.all([
      readCsvRows(valuesCsvPath),
      readCsvRows(passportCsvPath),
    ]);

    const passportByTag = new Map(passportRows.map((row) => [row.xml_tag, row]));
    const mergedRows: CanonicalDocxExtractedRow[] = valueRows.map((row) => {
      const passport = passportByTag.get(row.xml_tag);

      return {
        source_doc: params.filePath,
        form: params.formCode,
        year: params.year,
        xml_tag: row.xml_tag,
        value_raw: row.value_raw || null,
        table_code: passport?.table_code || null,
        table_title: passport?.table_title || null,
        row_no: passport?.row_no || null,
        row_label: passport?.row_label || null,
        col_no: passport?.col_no || null,
        col_label: passport?.col_label || null,
        tbl_seq: passport?.tbl_seq || row.tbl_seq || null,
        grid_r: passport?.r || null,
        grid_c: passport?.c || null,
      };
    });

    return {
      rows: mergedRows,
      structureSignature: createStructureSignature(
        mergedRows.map((row) => ({
          ...row,
          value_raw: null,
        })),
      ),
      structureStats: {
        valueRows: valueRows.length,
        passportRows: passportRows.length,
        mergedRows: mergedRows.length,
        uniqueTags: new Set(mergedRows.map((row) => row.xml_tag)).size,
        tableCodes: new Set(mergedRows.map((row) => row.table_code).filter(Boolean)).size,
      },
    } satisfies CanonicalDocxExtractionResult;
  } finally {
    await rm(tempDirectory, {
      recursive: true,
      force: true,
    });
  }
}

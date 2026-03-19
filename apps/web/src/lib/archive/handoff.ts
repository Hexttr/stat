import { readFile } from "node:fs/promises";
import path from "node:path";

type CsvRow = Record<string, string>;

export type HandoffSubject = {
  subjectOktmoKey: string;
  subjectName: string;
  canonicalName: string;
};

export type HandoffScopeEntity = {
  scopeType: string;
  scopeKey: string;
  scopeNameCanon: string;
  code4: string | null;
};

export type HandoffDocScopeEntry = {
  sourceDoc: string;
  year: number;
  form: string;
  code4: string | null;
  code5: string | null;
  subjectAlias: string | null;
  resolvedKind: "SUBJECT" | "SCOPE";
  subjectOktmoKey: string | null;
  scopeType: string | null;
  scopeKey: string | null;
  subjectNameCanon: string | null;
  scopeNameCanon: string | null;
  resolverVersion: string | null;
  updatedAt: string | null;
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

function getWorkspaceRoot() {
  return path.resolve(process.cwd(), "..", "..");
}

export function getHandoffRoot() {
  return path.join(getWorkspaceRoot(), "db", "handoff_it_20260209");
}

export function normalizeCanonText(value: string | null | undefined) {
  return (value ?? "")
    .toUpperCase()
    .replace(/[Ё]/g, "Е")
    .replace(/[–—−]/g, "-")
    .replace(/[«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseRu(value: string) {
  const lower = value.toLowerCase();

  return lower.replace(/(^|[\s\-(«"])([a-zа-яё])/g, (_, prefix: string, letter: string) =>
    `${prefix}${letter.toUpperCase()}`,
  );
}

function deriveShortName(fullName: string) {
  const shortName = fullName
    .replace(/^Республика\s+/i, "")
    .replace(/^Город\s+/i, "")
    .replace(/^Федеральная территория\s+/i, "")
    .trim();

  return shortName.length > 0 ? shortName : fullName;
}

function getSamplePath(...parts: string[]) {
  return path.join(getHandoffRoot(), "04_samples", ...parts);
}

export async function loadHandoffSubjects() {
  const rows = await readCsvRows(getSamplePath("rf_subjects_oktmo.csv"));

  return rows.map(
    (row) =>
      ({
        subjectOktmoKey: row.subject_oktmo_key,
        subjectName: row.subject_name,
        canonicalName: titleCaseRu(row.name_match),
      }) satisfies HandoffSubject,
  );
}

export async function loadHandoffScopeEntities() {
  const rows = await readCsvRows(getSamplePath("scope_entities.csv"));

  return rows.map(
    (row) =>
      ({
        scopeType: row.scope_type,
        scopeKey: row.scope_key,
        scopeNameCanon: row.scope_name_canon,
        code4: row.code4 || null,
      }) satisfies HandoffScopeEntity,
  );
}

export async function loadHandoffDocScopeEntries() {
  const rows = await readCsvRows(getSamplePath("v_doc_scope_canon.csv"));

  return rows.map(
    (row) =>
      ({
        sourceDoc: row.source_doc,
        year: Number(row.year),
        form: row.form,
        code4: row.code4 || null,
        code5: row.code5 || null,
        subjectAlias: row.subject_alias || null,
        resolvedKind: row.resolved_kind as "SUBJECT" | "SCOPE",
        subjectOktmoKey: row.subject_oktmo_key || null,
        scopeType: row.scope_type || null,
        scopeKey: row.scope_key || null,
        subjectNameCanon: row.subject_name_canon ? titleCaseRu(row.subject_name_canon) : null,
        scopeNameCanon: row.scope_name_canon ? titleCaseRu(row.scope_name_canon) : null,
        resolverVersion: row.resolver_version || null,
        updatedAt: row.updated_at || null,
      }) satisfies HandoffDocScopeEntry,
  );
}

export function getCanonicalRegionPayload(subject: HandoffSubject) {
  const fullName = subject.canonicalName;

  return {
    fullName,
    shortName: deriveShortName(fullName),
    canonicalName: subject.canonicalName,
    matchKey: normalizeCanonText(subject.canonicalName),
    code: `OKTMO_${subject.subjectOktmoKey}`,
    subjectOktmoKey: subject.subjectOktmoKey,
  };
}

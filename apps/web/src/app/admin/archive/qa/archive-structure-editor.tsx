"use client";

import { useMemo, useState } from "react";

import { RuntimeFormRenderer } from "@/components/forms/runtime-form-renderer";
import { type FormBuilderSchema } from "@/lib/form-builder/schema";
import { getInitialRuntimeValues } from "@/lib/form-builder/runtime";

type ArchiveStructureOverrideTargetTypeValue = "TABLE_TITLE" | "ROW_LABEL" | "COLUMN_LABEL";

type StructureEntry = {
  targetType: ArchiveStructureOverrideTargetTypeValue;
  tableId: string;
  rowKey: string | null;
  columnKey: string | null;
  originalLabel: string;
  currentLabel: string;
  overrideId: string | null;
  note: string | null;
};

type Props = {
  schema: FormBuilderSchema;
  entries: StructureEntry[];
  formTypeId: string;
  reportingYearId: string;
  returnTo: string;
  saveAction: (formData: FormData) => void | Promise<void>;
};

function makeEntryKey(entry: Pick<StructureEntry, "targetType" | "tableId" | "rowKey" | "columnKey">) {
  return `${entry.targetType}|${entry.tableId}|${entry.rowKey ?? ""}|${entry.columnKey ?? ""}`;
}

export function ArchiveStructureEditor({
  schema,
  entries,
  formTypeId,
  reportingYearId,
  returnTo,
  saveAction,
}: Props) {
  const [activeTableId, setActiveTableId] = useState(schema.tables[0]?.id ?? null);
  const [draftLabels, setDraftLabels] = useState<Record<string, string>>({});
  const runtimeValues = useMemo(() => getInitialRuntimeValues(schema), [schema]);

  const entryMap = useMemo(
    () => new Map(entries.map((entry) => [makeEntryKey(entry), entry])),
    [entries],
  );

  const activeTable = schema.tables.find((table) => table.id === activeTableId) ?? schema.tables[0] ?? null;

  function getEntry(params: {
    targetType: StructureEntry["targetType"];
    tableId: string;
    rowKey?: string | null;
    columnKey?: string | null;
    fallbackLabel: string;
  }): StructureEntry {
    const entryKey = makeEntryKey({
      targetType: params.targetType,
      tableId: params.tableId,
      rowKey: params.rowKey ?? null,
      columnKey: params.columnKey ?? null,
    });
    const existingEntry = entryMap.get(entryKey) ?? null;

    return {
      targetType: params.targetType,
      tableId: params.tableId,
      rowKey: params.rowKey ?? null,
      columnKey: params.columnKey ?? null,
      originalLabel: existingEntry?.originalLabel ?? params.fallbackLabel,
      currentLabel: draftLabels[entryKey] ?? existingEntry?.currentLabel ?? params.fallbackLabel,
      overrideId: existingEntry?.overrideId ?? null,
      note: existingEntry?.note ?? null,
    };
  }

  const serializedEntries = useMemo(
    () =>
      Object.entries(draftLabels)
        .map(([entryKey, label]) => {
          const existingEntry = entryMap.get(entryKey);
          if (!existingEntry) {
            return null;
          }

          const trimmedLabel = label.trim();
          if (trimmedLabel.length === 0 || trimmedLabel === existingEntry.originalLabel.trim()) {
            return null;
          }

          return {
            ...existingEntry,
            currentLabel: trimmedLabel,
          };
        })
        .filter((entry): entry is StructureEntry => Boolean(entry)),
    [draftLabels, entryMap],
  );

  const activeSchema = useMemo<FormBuilderSchema>(() => {
    if (!activeTable) {
      return {
        ...schema,
        tables: [],
      };
    }

    return {
      ...schema,
      tables: [
        {
          ...activeTable,
          title: getEntry({
            targetType: "TABLE_TITLE",
            tableId: activeTable.id,
            fallbackLabel: activeTable.title,
          }).currentLabel,
          rows: activeTable.rows.map((row) => ({
            ...row,
            label: getEntry({
              targetType: "ROW_LABEL",
              tableId: activeTable.id,
              rowKey: row.key,
              fallbackLabel: row.label,
            }).currentLabel,
          })),
          descriptorColumns: activeTable.descriptorColumns.map((column) => ({
            ...column,
            label: getEntry({
              targetType: "COLUMN_LABEL",
              tableId: activeTable.id,
              columnKey: column.key,
              fallbackLabel: column.label,
            }).currentLabel,
          })),
          columns: activeTable.columns.map((column) => ({
            ...column,
            label: getEntry({
              targetType: "COLUMN_LABEL",
              tableId: activeTable.id,
              columnKey: column.key,
              fallbackLabel: column.label,
            }).currentLabel,
          })),
        },
      ],
    };
  }, [activeTable, draftLabels, entryMap, schema]);

  function setDraftLabel(params: {
    targetType: StructureEntry["targetType"];
    tableId: string;
    rowKey?: string | null;
    columnKey?: string | null;
    label: string;
  }) {
    const entryKey = makeEntryKey({
      targetType: params.targetType,
      tableId: params.tableId,
      rowKey: params.rowKey ?? null,
      columnKey: params.columnKey ?? null,
    });

    setDraftLabels((currentDrafts) => ({
      ...currentDrafts,
      [entryKey]: params.label,
    }));
  }

  function updateTableTitle(tableId: string, title: string) {
    setDraftLabel({
      targetType: "TABLE_TITLE",
      tableId,
      label: title,
    });
  }

  function updateRowLabel(tableId: string, rowId: string, label: string) {
    const row = schema
      .tables.find((table) => table.id === tableId)
      ?.rows.find((candidate) => candidate.id === rowId);
    if (!row) {
      return;
    }

    setDraftLabel({
      targetType: "ROW_LABEL",
      tableId,
      rowKey: row.key,
      label,
    });
  }

  function updateDescriptorColumnLabel(tableId: string, columnId: string, label: string) {
    const column = schema
      .tables.find((table) => table.id === tableId)
      ?.descriptorColumns.find((candidate) => candidate.id === columnId);
    if (!column) {
      return;
    }

    setDraftLabel({
      targetType: "COLUMN_LABEL",
      tableId,
      columnKey: column.key,
      label,
    });
  }

  function updateInputColumnLabel(tableId: string, columnId: string, label: string) {
    const column = schema
      .tables.find((table) => table.id === tableId)
      ?.columns.find((candidate) => candidate.id === columnId);
    if (!column) {
      return;
    }

    setDraftLabel({
      targetType: "COLUMN_LABEL",
      tableId,
      columnKey: column.key,
      label,
    });
  }

  return (
    <form action={saveAction} className="mt-6 space-y-6">
      <input type="hidden" name="formTypeId" value={formTypeId} />
      <input type="hidden" name="reportingYearId" value={reportingYearId} />
      <input type="hidden" name="returnTo" value={returnTo} />

      {serializedEntries.map((entry, index) => (
        <div key={`${makeEntryKey(entry)}-${index}`} hidden>
          <input name={`overrides.${index}.targetType`} value={entry.targetType} readOnly />
          <input name={`overrides.${index}.tableId`} value={entry.tableId} readOnly />
          <input name={`overrides.${index}.rowKey`} value={entry.rowKey ?? ""} readOnly />
          <input name={`overrides.${index}.columnKey`} value={entry.columnKey ?? ""} readOnly />
          <input name={`overrides.${index}.originalLabel`} value={entry.originalLabel} readOnly />
          <input name={`overrides.${index}.overrideLabel`} value={entry.currentLabel} readOnly />
          <input name={`overrides.${index}.note`} value={entry.note ?? ""} readOnly />
        </div>
      ))}

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {schema.tables.map((table) => (
            <button
              key={table.id}
              type="button"
              onClick={() => setActiveTableId(table.id)}
              className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
                table.id === activeTable?.id
                  ? "border-[#2e78be] bg-blue-50 text-[#1f67ab]"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {table.title}
            </button>
          ))}
        </div>

        {activeTable ? (
          <RuntimeFormRenderer
            schema={activeSchema}
            values={runtimeValues}
            readOnly
            structureEditing={{
              onUpdateTableTitle: updateTableTitle,
              onUpdateRowLabel: updateRowLabel,
              onUpdateDescriptorColumnLabel: updateDescriptorColumnLabel,
              onUpdateInputColumnLabel: updateInputColumnLabel,
            }}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          К сохранению подготовлено правок: {serializedEntries.length}.
        </p>
        <button
          type="submit"
          disabled={serializedEntries.length === 0}
          className="rounded-2xl bg-[#1f67ab] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#185993] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Сохранить правки структуры
        </button>
      </div>
    </form>
  );
}

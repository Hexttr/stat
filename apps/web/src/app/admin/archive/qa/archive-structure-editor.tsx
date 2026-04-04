"use client";

import { useMemo, useState } from "react";

import { RuntimeFormRenderer } from "@/components/forms/runtime-form-renderer";
import { FormBuilderSchema } from "@/lib/form-builder/schema";
import { getInitialRuntimeValues } from "@/lib/form-builder/runtime";

type ArchiveStructureOverrideTargetTypeValue =
  | "TABLE_TITLE"
  | "ROW_LABEL"
  | "COLUMN_LABEL";

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
  const [draftSchema, setDraftSchema] = useState<FormBuilderSchema>(schema);
  const runtimeValues = useMemo(() => getInitialRuntimeValues(schema), [schema]);

  const entryMap = useMemo(
    () => new Map(entries.map((entry) => [makeEntryKey(entry), entry])),
    [entries],
  );

  const serializedEntries = useMemo(() => {
    return draftSchema.tables.flatMap((table) => {
      const tableEntry =
        entryMap.get(
          makeEntryKey({
            targetType: "TABLE_TITLE",
            tableId: table.id,
            rowKey: null,
            columnKey: null,
          }),
        ) ?? null;

      const nextEntries: StructureEntry[] = [
        {
          targetType: "TABLE_TITLE",
          tableId: table.id,
          rowKey: null,
          columnKey: null,
          originalLabel: tableEntry?.originalLabel ?? table.title,
          currentLabel: table.title,
          overrideId: tableEntry?.overrideId ?? null,
          note: tableEntry?.note ?? null,
        },
      ];

      for (const row of table.rows) {
        const rowEntry =
          entryMap.get(
            makeEntryKey({
              targetType: "ROW_LABEL",
              tableId: table.id,
              rowKey: row.key,
              columnKey: null,
            }),
          ) ?? null;

        nextEntries.push({
          targetType: "ROW_LABEL",
          tableId: table.id,
          rowKey: row.key,
          columnKey: null,
          originalLabel: rowEntry?.originalLabel ?? row.label,
          currentLabel: row.label,
          overrideId: rowEntry?.overrideId ?? null,
          note: rowEntry?.note ?? null,
        });
      }

      for (const column of table.descriptorColumns) {
        const columnEntry =
          entryMap.get(
            makeEntryKey({
              targetType: "COLUMN_LABEL",
              tableId: table.id,
              rowKey: null,
              columnKey: column.key,
            }),
          ) ?? null;

        nextEntries.push({
          targetType: "COLUMN_LABEL",
          tableId: table.id,
          rowKey: null,
          columnKey: column.key,
          originalLabel: columnEntry?.originalLabel ?? column.label,
          currentLabel: column.label,
          overrideId: columnEntry?.overrideId ?? null,
          note: columnEntry?.note ?? null,
        });
      }

      for (const column of table.columns) {
        const columnEntry =
          entryMap.get(
            makeEntryKey({
              targetType: "COLUMN_LABEL",
              tableId: table.id,
              rowKey: null,
              columnKey: column.key,
            }),
          ) ?? null;

        nextEntries.push({
          targetType: "COLUMN_LABEL",
          tableId: table.id,
          rowKey: null,
          columnKey: column.key,
          originalLabel: columnEntry?.originalLabel ?? column.label,
          currentLabel: column.label,
          overrideId: columnEntry?.overrideId ?? null,
          note: columnEntry?.note ?? null,
        });
      }

      return nextEntries;
    });
  }, [draftSchema, entryMap]);

  function updateTableTitle(tableId: string, title: string) {
    setDraftSchema((currentSchema) => ({
      ...currentSchema,
      tables: currentSchema.tables.map((table) =>
        table.id === tableId ? { ...table, title } : table,
      ),
    }));
  }

  function updateRowLabel(tableId: string, rowId: string, label: string) {
    setDraftSchema((currentSchema) => ({
      ...currentSchema,
      tables: currentSchema.tables.map((table) =>
        table.id !== tableId
          ? table
          : {
              ...table,
              rows: table.rows.map((row) => (row.id === rowId ? { ...row, label } : row)),
            },
      ),
    }));
  }

  function updateDescriptorColumnLabel(tableId: string, columnId: string, label: string) {
    setDraftSchema((currentSchema) => ({
      ...currentSchema,
      tables: currentSchema.tables.map((table) =>
        table.id !== tableId
          ? table
          : {
              ...table,
              descriptorColumns: table.descriptorColumns.map((column) =>
                column.id === columnId ? { ...column, label } : column,
              ),
            },
      ),
    }));
  }

  function updateInputColumnLabel(tableId: string, columnId: string, label: string) {
    setDraftSchema((currentSchema) => ({
      ...currentSchema,
      tables: currentSchema.tables.map((table) =>
        table.id !== tableId
          ? table
          : {
              ...table,
              columns: table.columns.map((column) =>
                column.id === columnId ? { ...column, label } : column,
              ),
            },
      ),
    }));
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

      <RuntimeFormRenderer
        schema={draftSchema}
        values={runtimeValues}
        readOnly
        structureEditing={{
          onUpdateTableTitle: updateTableTitle,
          onUpdateRowLabel: updateRowLabel,
          onUpdateDescriptorColumnLabel: updateDescriptorColumnLabel,
          onUpdateInputColumnLabel: updateInputColumnLabel,
        }}
      />

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-2xl bg-[#1f67ab] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#185993]"
        >
          Сохранить правки структуры
        </button>
      </div>
    </form>
  );
}

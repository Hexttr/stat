"use client";

import { ButtonHTMLAttributes, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ZodError } from "zod";

import { RuntimeFormRenderer } from "@/components/forms/runtime-form-renderer";
import {
  createDefaultDescriptorColumn,
  createDefaultInputColumn,
  createDefaultRow,
  createDefaultTable,
  duplicateDescriptorColumn,
  duplicateInputColumn,
  duplicateTableRow,
  duplicateTableSchema,
  FormBuilderSchema,
  FormTableColumn,
  FormTableDescriptorColumn,
  FormTableRow,
  getFormSchemaIssues,
  parseAndNormalizeFormSchema,
} from "@/lib/form-builder/schema";
import { getInitialRuntimeValues, RuntimeValueMap } from "@/lib/form-builder/runtime";

type VersionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type EditorMode = "preview" | "advanced";

type Props = {
  versionId: string;
  formCode: string;
  templateName: string;
  initialTitle: string;
  reportingYear: number;
  versionNumber: number;
  versionStatus: VersionStatus;
  initialSchema: FormBuilderSchema;
  saved: boolean;
  published: boolean;
  error: string | null;
  importNotice: string | null;
  warning: string | null;
  publishedMeta: {
    fullName: string;
    publishedAtLabel: string;
  } | null;
  saveAction: (formData: FormData) => void | Promise<void>;
  publishAction: (formData: FormData) => void | Promise<void>;
};

function SortableChip({
  id,
  label,
  meta,
  isSelected,
  onSelect,
}: {
  id: string;
  label: string;
  meta?: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={`flex min-w-[180px] items-center justify-between rounded-2xl border px-4 py-3 text-left shadow-sm transition ${
        isSelected
          ? "border-blue-300 bg-blue-50 text-blue-900"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      <span className="font-medium">{label}</span>
      {meta ? (
        <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
          {meta}
        </span>
      ) : null}
    </button>
  );
}

function SecondaryActionButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
        props.className ?? ""
      }`}
    >
      {children}
    </button>
  );
}

export function FormBuilderWorkspace({
  versionId,
  formCode,
  templateName,
  initialTitle,
  reportingYear,
  versionNumber,
  versionStatus,
  initialSchema,
  saved,
  published,
  error,
  importNotice,
  warning,
  publishedMeta,
  saveAction,
  publishAction,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [schema, setSchema] = useState<FormBuilderSchema>(initialSchema);
  const [activeTableId, setActiveTableId] = useState(initialSchema.tables[0]?.id ?? null);
  const [selectedColumnId, setSelectedColumnId] = useState(
    initialSchema.tables[0]?.columns[0]?.id ?? null,
  );
  const [selectedDescriptorColumnId, setSelectedDescriptorColumnId] = useState(
    initialSchema.tables[0]?.descriptorColumns[0]?.id ?? null,
  );
  const [selectedRowId, setSelectedRowId] = useState(
    initialSchema.tables[0]?.rows[0]?.id ?? null,
  );
  const [editorMode, setEditorMode] = useState<EditorMode>("preview");
  const [previewValues, setPreviewValues] = useState<RuntimeValueMap>(
    getInitialRuntimeValues(initialSchema),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const table = schema.tables.find((item) => item.id === activeTableId) ?? schema.tables[0];
  const selectedColumn =
    table.columns.find((column) => column.id === selectedColumnId) ?? table.columns[0];
  const selectedDescriptorColumn =
    table.descriptorColumns.find((column) => column.id === selectedDescriptorColumnId) ??
    table.descriptorColumns[0] ??
    null;
  const selectedRow = table.rows.find((row) => row.id === selectedRowId) ?? table.rows[0];
  const isPublished = versionStatus === "PUBLISHED";

  const normalizedSchema = useMemo(
    () => ({
      ...schema,
      meta: {
        ...schema.meta,
        title,
      },
    }),
    [schema, title],
  );

  const validationIssues = useMemo(() => {
    try {
      parseAndNormalizeFormSchema(normalizedSchema);
      return [] as string[];
    } catch (caught) {
      if (caught instanceof ZodError) {
        return caught.issues.map((issue) => issue.message);
      }
      return getFormSchemaIssues(normalizedSchema);
    }
  }, [normalizedSchema]);

  const serializedSchema = useMemo(
    () => JSON.stringify(normalizedSchema),
    [normalizedSchema],
  );

  useEffect(() => {
    const currentTable =
      schema.tables.find((item) => item.id === activeTableId) ?? schema.tables[0];

    if (!currentTable) {
      return;
    }

    setActiveTableId(currentTable.id);
    setSelectedColumnId((currentId) =>
      currentTable.columns.some((column) => column.id === currentId)
        ? currentId
        : (currentTable.columns[0]?.id ?? null),
    );
    setSelectedDescriptorColumnId((currentId) =>
      currentTable.descriptorColumns.some((column) => column.id === currentId)
        ? currentId
        : (currentTable.descriptorColumns[0]?.id ?? null),
    );
    setSelectedRowId((currentId) =>
      currentTable.rows.some((row) => row.id === currentId)
        ? currentId
        : (currentTable.rows[0]?.id ?? null),
    );
  }, [activeTableId, schema.tables]);

  useEffect(() => {
    setPreviewValues((currentValues) => getInitialRuntimeValues(normalizedSchema, currentValues));
  }, [normalizedSchema]);

  function updateSchema(updater: (currentSchema: FormBuilderSchema) => FormBuilderSchema) {
    setSchema((currentSchema) => updater(currentSchema));
  }

  function updateTableById(
    tableId: string,
    updater: (table: FormBuilderSchema["tables"][number]) => FormBuilderSchema["tables"][number],
  ) {
    updateSchema((currentSchema) => ({
      ...currentSchema,
      tables: currentSchema.tables.map((candidateTable) =>
        candidateTable.id === tableId ? updater(candidateTable) : candidateTable,
      ),
    }));
  }

  function updateActiveTable(
    updater: (currentTable: FormBuilderSchema["tables"][number]) => FormBuilderSchema["tables"][number],
  ) {
    updateTableById(table.id, updater);
  }

  function selectTable(nextTableId: string) {
    const nextTable = schema.tables.find((item) => item.id === nextTableId) ?? schema.tables[0];
    setActiveTableId(nextTable.id);
    setSelectedColumnId(nextTable.columns[0]?.id ?? null);
    setSelectedDescriptorColumnId(nextTable.descriptorColumns[0]?.id ?? null);
    setSelectedRowId(nextTable.rows[0]?.id ?? null);
  }

  function handleTableDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    updateSchema((currentSchema) => {
      const oldIndex = currentSchema.tables.findIndex((item) => item.id === active.id);
      const newIndex = currentSchema.tables.findIndex((item) => item.id === over.id);

      return {
        ...currentSchema,
        tables: arrayMove(currentSchema.tables, oldIndex, newIndex),
      };
    });
  }

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    updateActiveTable((currentTable) => {
      const oldIndex = currentTable.columns.findIndex((item) => item.id === active.id);
      const newIndex = currentTable.columns.findIndex((item) => item.id === over.id);

      return {
        ...currentTable,
        columns: arrayMove(currentTable.columns, oldIndex, newIndex),
      };
    });
  }

  function handleRowDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    updateActiveTable((currentTable) => {
      const oldIndex = currentTable.rows.findIndex((item) => item.id === active.id);
      const newIndex = currentTable.rows.findIndex((item) => item.id === over.id);

      return {
        ...currentTable,
        rows: arrayMove(currentTable.rows, oldIndex, newIndex),
      };
    });
  }

  function addTable() {
    const nextTable = createDefaultTable(schema.tables.length);
    updateSchema((currentSchema) => ({
      ...currentSchema,
      tables: [...currentSchema.tables, nextTable],
    }));
    selectTable(nextTable.id);
  }

  function duplicateCurrentTable() {
    updateSchema((currentSchema) => {
      const nextTable = duplicateTableSchema(table, currentSchema.tables);
      return {
        ...currentSchema,
        tables: [...currentSchema.tables, nextTable],
      };
    });
  }

  function deleteCurrentTable() {
    if (schema.tables.length <= 1) {
      return;
    }

    const nextTables = schema.tables.filter((item) => item.id !== table.id);
    updateSchema((currentSchema) => ({
      ...currentSchema,
      tables: currentSchema.tables.filter((item) => item.id !== table.id),
    }));
    if (nextTables[0]) {
      selectTable(nextTables[0].id);
    }
  }

  function addInputColumn() {
    updateActiveTable((currentTable) => ({
      ...currentTable,
      columns: [...currentTable.columns, createDefaultInputColumn(currentTable.columns.length)],
    }));
  }

  function duplicateCurrentColumn() {
    updateActiveTable((currentTable) => ({
      ...currentTable,
      columns: [...currentTable.columns, duplicateInputColumn(selectedColumn, currentTable.columns)],
    }));
  }

  function deleteCurrentColumn() {
    if (table.columns.length <= 1) {
      return;
    }

    updateActiveTable((currentTable) => ({
      ...currentTable,
      columns: currentTable.columns.filter((item) => item.id !== selectedColumn.id),
    }));
  }

  function addDescriptorColumn() {
    const nextDescriptor = createDefaultDescriptorColumn(table.descriptorColumns.length);
    updateActiveTable((currentTable) => ({
      ...currentTable,
      descriptorColumns: [...currentTable.descriptorColumns, nextDescriptor],
      rows: currentTable.rows.map((row) => ({
        ...row,
        descriptorValues: {
          ...row.descriptorValues,
          [nextDescriptor.id]: null,
        },
      })),
    }));
    setSelectedDescriptorColumnId(nextDescriptor.id);
  }

  function duplicateCurrentDescriptorColumn() {
    if (!selectedDescriptorColumn) {
      return;
    }

    const nextDescriptor = duplicateDescriptorColumn(
      selectedDescriptorColumn,
      table.descriptorColumns,
    );

    updateActiveTable((currentTable) => ({
      ...currentTable,
      descriptorColumns: [...currentTable.descriptorColumns, nextDescriptor],
      rows: currentTable.rows.map((row) => ({
        ...row,
        descriptorValues: {
          ...row.descriptorValues,
          [nextDescriptor.id]: row.descriptorValues?.[selectedDescriptorColumn.id] ?? null,
        },
      })),
    }));
    setSelectedDescriptorColumnId(nextDescriptor.id);
  }

  function deleteCurrentDescriptorColumn() {
    if (!selectedDescriptorColumn) {
      return;
    }

    updateActiveTable((currentTable) => ({
      ...currentTable,
      descriptorColumns: currentTable.descriptorColumns.filter(
        (item) => item.id !== selectedDescriptorColumn.id,
      ),
      rows: currentTable.rows.map((row) => {
        const descriptorValues = { ...row.descriptorValues };
        delete descriptorValues[selectedDescriptorColumn.id];
        return {
          ...row,
          descriptorValues,
        };
      }),
    }));
  }

  function addRow() {
    const nextRow = createDefaultRow(table.rows.length, table.descriptorColumns);
    updateActiveTable((currentTable) => ({
      ...currentTable,
      rows: [...currentTable.rows, nextRow],
    }));
    setSelectedRowId(nextRow.id);
  }

  function duplicateCurrentRow() {
    const nextRow = duplicateTableRow(selectedRow, table.rows);
    updateActiveTable((currentTable) => ({
      ...currentTable,
      rows: [...currentTable.rows, nextRow],
    }));
    setSelectedRowId(nextRow.id);
  }

  function deleteCurrentRow() {
    if (table.rows.length <= 1) {
      return;
    }

    updateActiveTable((currentTable) => ({
      ...currentTable,
      rows: currentTable.rows.filter((item) => item.id !== selectedRow.id),
    }));
  }

  function updateSelectedColumn<K extends keyof FormTableColumn>(key: K, value: FormTableColumn[K]) {
    updateActiveTable((currentTable) => ({
      ...currentTable,
      columns: currentTable.columns.map((item) =>
        item.id === selectedColumn.id ? { ...item, [key]: value } : item,
      ),
    }));
  }

  function updateSelectedDescriptorColumn<K extends keyof FormTableDescriptorColumn>(
    key: K,
    value: FormTableDescriptorColumn[K],
  ) {
    if (!selectedDescriptorColumn) {
      return;
    }

    updateActiveTable((currentTable) => ({
      ...currentTable,
      descriptorColumns: currentTable.descriptorColumns.map((item) =>
        item.id === selectedDescriptorColumn.id ? { ...item, [key]: value } : item,
      ),
    }));
  }

  function updateSelectedRow<K extends keyof FormTableRow>(key: K, value: FormTableRow[K]) {
    updateActiveTable((currentTable) => ({
      ...currentTable,
      rows: currentTable.rows.map((item) =>
        item.id === selectedRow.id ? { ...item, [key]: value } : item,
      ),
    }));
  }

  function updateSelectedRowDescriptorValue(descriptorId: string, value: string) {
    updateSelectedRow("descriptorValues", {
      ...selectedRow.descriptorValues,
      [descriptorId]: value || null,
    });
  }

  function updateRowById(rowId: string, patch: Partial<FormTableRow>) {
    updateActiveTable((currentTable) => ({
      ...currentTable,
      rows: currentTable.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    }));
  }

  function updateColumnById(columnId: string, patch: Partial<FormTableColumn>) {
    updateActiveTable((currentTable) => ({
      ...currentTable,
      columns: currentTable.columns.map((column) =>
        column.id === columnId ? { ...column, ...patch } : column,
      ),
    }));
  }

  function updateDescriptorColumnById(
    columnId: string,
    patch: Partial<FormTableDescriptorColumn>,
  ) {
    updateActiveTable((currentTable) => ({
      ...currentTable,
      descriptorColumns: currentTable.descriptorColumns.map((column) =>
        column.id === columnId ? { ...column, ...patch } : column,
      ),
    }));
  }

  function updateRowDescriptorValueById(rowId: string, descriptorId: string, value: string) {
    updateActiveTable((currentTable) => ({
      ...currentTable,
      rows: currentTable.rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              descriptorValues: {
                ...row.descriptorValues,
                [descriptorId]: value || null,
              },
            }
          : row,
      ),
    }));
  }

  function createSystemKey(value: string, fallbackPrefix: string, index: number) {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/giu, "_")
      .replace(/^_+|_+$/gu, "");

    return normalized || `${fallbackPrefix}_${index + 1}`;
  }

  function insertItemAtIndex<T>(items: T[], index: number, nextItem: T) {
    return [...items.slice(0, index), nextItem, ...items.slice(index)];
  }

  function insertRowAround(
    tableId: string,
    anchorRowId: string,
    position: "before" | "after",
  ) {
    updateTableById(tableId, (currentTable) => {
      const anchorIndex = currentTable.rows.findIndex((row) => row.id === anchorRowId);
      const insertIndex =
        anchorIndex < 0 ? currentTable.rows.length : position === "before" ? anchorIndex : anchorIndex + 1;
      const nextRow = createDefaultRow(currentTable.rows.length, currentTable.descriptorColumns);
      const anchorRow = anchorIndex >= 0 ? currentTable.rows[anchorIndex] : null;

      nextRow.indent = anchorRow?.indent ?? 0;
      nextRow.rowType = anchorRow?.rowType ?? "data";
      nextRow.groupPrefix = anchorRow?.groupPrefix ?? null;

      setActiveTableId(tableId);
      setSelectedRowId(nextRow.id);

      return {
        ...currentTable,
        rows: insertItemAtIndex(currentTable.rows, insertIndex, nextRow),
      };
    });
  }

  function deleteRowById(tableId: string, rowId: string) {
    updateTableById(tableId, (currentTable) => {
      if (currentTable.rows.length <= 1) {
        return currentTable;
      }

      return {
        ...currentTable,
        rows: currentTable.rows.filter((row) => row.id !== rowId),
      };
    });
  }

  function insertInputColumnAround(
    tableId: string,
    anchorColumnId: string,
    position: "before" | "after",
  ) {
    updateTableById(tableId, (currentTable) => {
      const anchorIndex = currentTable.columns.findIndex((column) => column.id === anchorColumnId);
      const insertIndex =
        anchorIndex < 0
          ? currentTable.columns.length
          : position === "before"
            ? anchorIndex
            : anchorIndex + 1;
      const nextColumn = createDefaultInputColumn(currentTable.columns.length);

      setActiveTableId(tableId);
      setSelectedColumnId(nextColumn.id);

      return {
        ...currentTable,
        columns: insertItemAtIndex(currentTable.columns, insertIndex, nextColumn),
      };
    });
  }

  function deleteInputColumnById(tableId: string, columnId: string) {
    updateTableById(tableId, (currentTable) => {
      if (currentTable.columns.length <= 1) {
        return currentTable;
      }

      return {
        ...currentTable,
        columns: currentTable.columns.filter((column) => column.id !== columnId),
      };
    });
  }

  function insertDescriptorColumnAround(
    tableId: string,
    anchorColumnId: string,
    position: "before" | "after",
  ) {
    updateTableById(tableId, (currentTable) => {
      const anchorIndex = currentTable.descriptorColumns.findIndex(
        (column) => column.id === anchorColumnId,
      );
      const insertIndex =
        anchorIndex < 0
          ? currentTable.descriptorColumns.length
          : position === "before"
            ? anchorIndex
            : anchorIndex + 1;
      const nextDescriptor = createDefaultDescriptorColumn(
        currentTable.descriptorColumns.length,
      );

      setActiveTableId(tableId);
      setSelectedDescriptorColumnId(nextDescriptor.id);

      return {
        ...currentTable,
        descriptorColumns: insertItemAtIndex(
          currentTable.descriptorColumns,
          insertIndex,
          nextDescriptor,
        ),
        rows: currentTable.rows.map((row) => ({
          ...row,
          descriptorValues: {
            ...row.descriptorValues,
            [nextDescriptor.id]: null,
          },
        })),
      };
    });
  }

  function deleteDescriptorColumnById(tableId: string, columnId: string) {
    updateTableById(tableId, (currentTable) => ({
      ...currentTable,
      descriptorColumns: currentTable.descriptorColumns.filter(
        (column) => column.id !== columnId,
      ),
      rows: currentTable.rows.map((row) => {
        const descriptorValues = { ...row.descriptorValues };
        delete descriptorValues[columnId];
        return {
          ...row,
          descriptorValues,
        };
      }),
    }));
  }

  function updateRowLabelById(tableId: string, rowId: string, label: string) {
    updateTableById(tableId, (currentTable) => ({
      ...currentTable,
      rows: currentTable.rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              label,
            }
          : row,
      ),
    }));
  }

  function updateInputColumnLabelById(
    tableId: string,
    columnId: string,
    label: string,
  ) {
    updateTableById(tableId, (currentTable) => ({
      ...currentTable,
      columns: currentTable.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              label,
            }
          : column,
      ),
    }));
  }

  function updateDescriptorColumnLabelById(
    tableId: string,
    columnId: string,
    label: string,
  ) {
    updateTableById(tableId, (currentTable) => ({
      ...currentTable,
      descriptorColumns: currentTable.descriptorColumns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              label,
            }
          : column,
      ),
    }));
  }

  function parseBulkLines(text: string) {
    return text
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function parseBulkCells(text: string) {
    return text
      .split(/[\r\n\t]+/gu)
      .map((cell) => cell.trim())
      .filter(Boolean);
  }

  function applyBulkRows(text: string) {
    const lines = parseBulkLines(text);

    if (lines.length === 0) {
      return;
    }

    updateActiveTable((currentTable) => ({
      ...currentTable,
      rows: lines.map((line, index) => {
        const existingRow = currentTable.rows[index];
        const baseRow = existingRow ?? createDefaultRow(index, currentTable.descriptorColumns);

        return {
          ...baseRow,
          label: line,
          key: existingRow?.key ?? createSystemKey(line, "indicator", index),
          descriptorValues: Object.fromEntries(
            currentTable.descriptorColumns.map((column) => [
              column.id,
              existingRow?.descriptorValues?.[column.id] ??
                baseRow.descriptorValues?.[column.id] ??
                null,
            ]),
          ),
        };
      }),
    }));
  }

  function applyBulkColumns(text: string) {
    const labels = parseBulkCells(text);

    if (labels.length === 0) {
      return;
    }

    updateActiveTable((currentTable) => ({
      ...currentTable,
      columns: labels.map((label, index) => {
        const existingColumn = currentTable.columns[index];
        const baseColumn = existingColumn ?? createDefaultInputColumn(index);

        return {
          ...baseColumn,
          label,
          key: existingColumn?.key ?? createSystemKey(label, "value", index),
        };
      }),
    }));
  }

  function applyBulkDescriptorValues(text: string) {
    if (!selectedDescriptorColumn) {
      return;
    }

    const lines = parseBulkLines(text);

    if (lines.length === 0) {
      return;
    }

    updateActiveTable((currentTable) => ({
      ...currentTable,
      rows: currentTable.rows.map((row, index) => ({
        ...row,
        descriptorValues: {
          ...row.descriptorValues,
          [selectedDescriptorColumn.id]: lines[index] ?? row.descriptorValues?.[selectedDescriptorColumn.id] ?? null,
        },
      })),
    }));
  }

  function updatePreviewValue(fieldKey: string, value: string | boolean) {
    setPreviewValues((currentValues) => ({
      ...currentValues,
      [fieldKey]: value,
    }));
  }

  function parseOptions(value: string) {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [rawLabel, rawValue] = line.includes("|") ? line.split("|") : [line, line];
        return {
          label: rawLabel.trim(),
          value: (rawValue ?? rawLabel).trim(),
        };
      });
  }

  const optionEditorValue = selectedColumn.options
    .map((option) => `${option.label}|${option.value}`)
    .join("\n");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin/forms"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Назад к каталогу
              </Link>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {formCode}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isPublished ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {isPublished ? "Опубликована" : "Черновик"}
              </span>
            </div>

            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                {templateName} / {reportingYear} / v{versionNumber}
              </p>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={isPublished}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-3xl font-semibold text-slate-950 disabled:bg-slate-50 xl:min-w-[560px]"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <form action={saveAction} className="contents">
              <input type="hidden" name="versionId" value={versionId} />
              <input type="hidden" name="title" value={title} />
              <input type="hidden" name="schemaJson" value={serializedSchema} />
              <button
                type="submit"
                disabled={isPublished || validationIssues.length > 0}
                className="rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Сохранить черновик
              </button>
            </form>

            <form action={publishAction} className="contents">
              <input type="hidden" name="versionId" value={versionId} />
              <button
                type="submit"
                disabled={isPublished || validationIssues.length > 0}
                className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Опубликовать версию
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setEditorMode("preview")}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
              editorMode === "preview"
                ? "bg-blue-600 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setEditorMode("advanced")}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
              editorMode === "advanced"
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Расширенное редактирование
          </button>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          Основной сценарий: импортировать структуру из `.doc`, проверить форму в `Preview`
          и сразу внести точечные правки прямо в таблице. `Расширенное редактирование`
          используйте только для сложной настройки структуры и полей.
        </p>

        {saved ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Черновик формы сохранен.
          </p>
        ) : null}

        {published ? (
          <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Версия формы опубликована и готова к назначению регионам.
          </p>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {importNotice ? (
          <p className="mt-6 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {importNotice}
          </p>
        ) : null}

        {warning ? (
          <p className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {warning}
          </p>
        ) : null}

        {publishedMeta ? (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Опубликовано: {publishedMeta.publishedAtLabel} пользователем {publishedMeta.fullName}.
          </p>
        ) : (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Сначала сохраните черновик, затем публикуйте. После публикации прямое редактирование блокируется.
          </p>
        )}

        {validationIssues.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-medium">Перед сохранением исправьте структуру формы:</p>
            <ul className="mt-2 space-y-1 text-amber-800">
              {validationIssues.map((issue) => (
                <li key={issue}>- {issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Таблицы</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">Структура формы</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <SecondaryActionButton type="button" onClick={addTable} disabled={isPublished}>
              Добавить таблицу
            </SecondaryActionButton>
            <SecondaryActionButton
              type="button"
              onClick={duplicateCurrentTable}
              disabled={isPublished}
            >
              Дублировать таблицу
            </SecondaryActionButton>
            <SecondaryActionButton
              type="button"
              onClick={deleteCurrentTable}
              disabled={isPublished || schema.tables.length <= 1}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              Удалить таблицу
            </SecondaryActionButton>
          </div>
        </div>

        <div className="mt-5">
          <DndContext
            id="form-builder-tables"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleTableDragEnd}
          >
            <SortableContext
              items={schema.tables.map((item) => item.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex gap-3 overflow-x-auto pb-2">
                {schema.tables.map((item, index) => (
                  <SortableChip
                    key={item.id}
                    id={item.id}
                    label={item.title}
                    meta={`table ${index + 1}`}
                    isSelected={item.id === table.id}
                    onSelect={() => selectTable(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </section>

      {editorMode === "preview" ? (
        <RuntimeFormRenderer
          schema={normalizedSchema}
          values={previewValues}
          onValueChange={updatePreviewValue}
          readOnly={isPublished}
          structureEditing={
            isPublished
              ? undefined
              : {
                  onUpdateRowLabel: updateRowLabelById,
                  onInsertRow: insertRowAround,
                  onDeleteRow: deleteRowById,
                  onUpdateDescriptorColumnLabel: updateDescriptorColumnLabelById,
                  onInsertDescriptorColumn: insertDescriptorColumnAround,
                  onDeleteDescriptorColumn: deleteDescriptorColumnById,
                  onUpdateInputColumnLabel: updateInputColumnLabelById,
                  onInsertInputColumn: insertInputColumnAround,
                  onDeleteInputColumn: deleteInputColumnById,
                }
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_380px] 2xl:grid-cols-[300px_minmax(0,1fr)_460px]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Строки</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">Показатели</h2>
                </div>
                <SecondaryActionButton type="button" onClick={addRow} disabled={isPublished}>
                  Добавить
                </SecondaryActionButton>
              </div>

              <div className="mt-5">
                <DndContext
                  id="form-builder-rows"
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleRowDragEnd}
                >
                  <SortableContext
                    items={table.rows.map((row) => row.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {table.rows.map((row) => (
                        <SortableChip
                          key={row.id}
                          id={row.id}
                          label={row.label}
                          meta={row.key}
                          isSelected={row.id === selectedRow.id}
                          onSelect={() => setSelectedRowId(row.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              <div className="mt-5 grid gap-3">
                <SecondaryActionButton
                  type="button"
                  onClick={duplicateCurrentRow}
                  disabled={isPublished}
                >
                  Дублировать строку
                </SecondaryActionButton>
                <SecondaryActionButton
                  type="button"
                  onClick={deleteCurrentRow}
                  disabled={isPublished || table.rows.length <= 1}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  Удалить строку
                </SecondaryActionButton>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                    Служебные колонки
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">
                    Архивные реквизиты строки
                  </h2>
                </div>
                <SecondaryActionButton
                  type="button"
                  onClick={addDescriptorColumn}
                  disabled={isPublished}
                >
                  Добавить
                </SecondaryActionButton>
              </div>

              <div className="mt-5 space-y-3">
                {table.descriptorColumns.map((column) => (
                  <button
                    key={column.id}
                    type="button"
                    onClick={() => setSelectedDescriptorColumnId(column.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left shadow-sm transition ${
                      selectedDescriptorColumn?.id === column.id
                        ? "border-blue-300 bg-blue-50 text-blue-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <span className="block font-medium">{column.label}</span>
                    <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
                      {column.key}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-3">
                <SecondaryActionButton
                  type="button"
                  onClick={duplicateCurrentDescriptorColumn}
                  disabled={isPublished || !selectedDescriptorColumn}
                >
                  Дублировать служебную колонку
                </SecondaryActionButton>
                <SecondaryActionButton
                  type="button"
                  onClick={deleteCurrentDescriptorColumn}
                  disabled={isPublished || !selectedDescriptorColumn}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  Удалить служебную колонку
                </SecondaryActionButton>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Колонки</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">
                  Таблица с горизонтальным скроллом
                </h2>
              </div>
              <SecondaryActionButton
                type="button"
                onClick={addInputColumn}
                disabled={isPublished}
              >
                Добавить
              </SecondaryActionButton>
            </div>

            <div className="mt-5">
              <DndContext
                id="form-builder-columns"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleColumnDragEnd}
              >
                <SortableContext
                  items={table.columns.map((column) => column.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {table.columns.map((column) => (
                      <SortableChip
                        key={column.id}
                        id={column.id}
                        label={column.label}
                        meta={column.fieldType}
                        isSelected={column.id === selectedColumn.id}
                        onSelect={() => setSelectedColumnId(column.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <SecondaryActionButton
                type="button"
                onClick={duplicateCurrentColumn}
                disabled={isPublished}
              >
                Дублировать колонку
              </SecondaryActionButton>
              <SecondaryActionButton
                type="button"
                onClick={deleteCurrentColumn}
                disabled={isPublished || table.columns.length <= 1}
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                Удалить колонку
              </SecondaryActionButton>
            </div>

            <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-200">
              <table className="min-w-[1080px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 min-w-[320px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700">
                      Наименование
                    </th>
                    {table.descriptorColumns.map((column) => (
                      <th
                        key={column.id}
                        className={`sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-medium ${
                          selectedDescriptorColumn?.id === column.id
                            ? "text-blue-700"
                            : "text-slate-700"
                        }`}
                        style={{ minWidth: `${column.width}px` }}
                      >
                        {column.label}
                      </th>
                    ))}
                    {table.columns.map((column) => (
                      <th
                        key={column.id}
                        className={`sticky top-0 border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium ${
                          column.id === selectedColumn.id ? "text-blue-700" : "text-slate-700"
                        }`}
                        style={{ minWidth: `${column.width}px` }}
                      >
                        <div className="space-y-1">
                          <p>{column.label}</p>
                          <p className="text-xs font-normal text-slate-500">
                            {[column.fieldType, column.unit].filter(Boolean).join(" / ")}
                          </p>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row.id}>
                      <td
                        className={`sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-4 ${
                          row.id === selectedRow.id ? "text-blue-700" : "text-slate-800"
                        }`}
                      >
                        <div className="space-y-1">
                          <p className="font-medium">{row.label}</p>
                          {row.description ? (
                            <p className="text-xs text-slate-500">{row.description}</p>
                          ) : null}
                        </div>
                      </td>
                      {table.descriptorColumns.map((column) => (
                        <td
                          key={`${row.id}-${column.id}`}
                          className={`border-b border-r border-slate-200 px-4 py-4 ${
                            selectedDescriptorColumn?.id === column.id
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-600"
                          }`}
                        >
                          {row.descriptorValues?.[column.id] ?? "—"}
                        </td>
                      ))}
                      {table.columns.map((column) => (
                        <td
                          key={`${row.id}-${column.id}`}
                          className="border-b border-slate-200 px-4 py-4"
                        >
                          <div
                            className={`rounded-2xl border px-3 py-3 text-slate-400 ${
                              column.id === selectedColumn.id || row.id === selectedRow.id
                                ? "border-blue-200 bg-blue-50"
                                : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            {column.placeholder || "Ячейка"}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Таблица</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">
                Свойства активной таблицы
              </h2>

              <div className="mt-5 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Название</span>
                  <input
                    value={table.title}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateActiveTable((currentTable) => ({
                        ...currentTable,
                        title: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Описание</span>
                  <textarea
                    rows={3}
                    value={table.description ?? ""}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateActiveTable((currentTable) => ({
                        ...currentTable,
                        description: event.target.value || null,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={table.settings.stickyHeader}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateActiveTable((currentTable) => ({
                        ...currentTable,
                        settings: {
                          ...currentTable.settings,
                          stickyHeader: event.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-700">Sticky header</span>
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={table.settings.stickyFirstColumn}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateActiveTable((currentTable) => ({
                        ...currentTable,
                        settings: {
                          ...currentTable.settings,
                          stickyFirstColumn: event.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-700">Sticky first column</span>
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={table.settings.horizontalScroll}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateActiveTable((currentTable) => ({
                        ...currentTable,
                        settings: {
                          ...currentTable.settings,
                          horizontalScroll: event.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-700">Horizontal scroll</span>
                </label>
              </div>
            </div>

            {selectedDescriptorColumn ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Служебная колонка</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">
                  Свойства служебной колонки
                </h2>

                <div className="mt-5 space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Заголовок</span>
                    <input
                      value={selectedDescriptorColumn.label}
                      disabled={isPublished}
                      onChange={(event) =>
                        updateSelectedDescriptorColumn("label", event.target.value)
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Ключ</span>
                    <input
                      value={selectedDescriptorColumn.key}
                      disabled={isPublished}
                      onChange={(event) =>
                        updateSelectedDescriptorColumn("key", event.target.value)
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Ширина</span>
                    <input
                      type="number"
                      min={100}
                      max={320}
                      value={selectedDescriptorColumn.width}
                      disabled={isPublished}
                      onChange={(event) =>
                        updateSelectedDescriptorColumn("width", Number(event.target.value))
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Колонка</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">
                Свойства выбранного столбца
              </h2>

              <div className="mt-5 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Заголовок</span>
                  <input
                    value={selectedColumn.label}
                    disabled={isPublished}
                    onChange={(event) => updateSelectedColumn("label", event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Ключ</span>
                  <input
                    value={selectedColumn.key}
                    disabled={isPublished}
                    onChange={(event) => updateSelectedColumn("key", event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Тип поля</span>
                  <select
                    value={selectedColumn.fieldType}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateSelectedColumn(
                        "fieldType",
                        event.target.value as FormTableColumn["fieldType"],
                      )
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  >
                    <option value="number">number</option>
                    <option value="text">text</option>
                    <option value="textarea">textarea</option>
                    <option value="select">select</option>
                    <option value="checkbox">checkbox</option>
                    <option value="date">date</option>
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedColumn.required}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateSelectedColumn("required", event.target.checked)
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-700">Обязательное поле</span>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Единица измерения</span>
                  <input
                    value={selectedColumn.unit ?? ""}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateSelectedColumn("unit", event.target.value || null)
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Подсказка в ячейке</span>
                  <input
                    value={selectedColumn.placeholder ?? ""}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateSelectedColumn("placeholder", event.target.value || null)
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Help text</span>
                  <textarea
                    rows={3}
                    value={selectedColumn.helpText ?? ""}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateSelectedColumn("helpText", event.target.value || null)
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Ширина колонки</span>
                  <input
                    type="number"
                    min={120}
                    max={480}
                    value={selectedColumn.width}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateSelectedColumn("width", Number(event.target.value))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                {selectedColumn.fieldType === "select" ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      Опции (`label|value`, по строке)
                    </span>
                    <textarea
                      rows={5}
                      value={optionEditorValue}
                      disabled={isPublished}
                      onChange={(event) =>
                        updateSelectedColumn("options", parseOptions(event.target.value))
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-900 disabled:bg-slate-50"
                    />
                  </label>
                ) : null}

                {selectedColumn.fieldType === "number" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Минимум</span>
                      <input
                        type="number"
                        step="any"
                        value={selectedColumn.validation.minNumber ?? ""}
                        disabled={isPublished}
                        onChange={(event) =>
                          updateSelectedColumn("validation", {
                            ...selectedColumn.validation,
                            minNumber:
                              event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Максимум</span>
                      <input
                        type="number"
                        step="any"
                        value={selectedColumn.validation.maxNumber ?? ""}
                        disabled={isPublished}
                        onChange={(event) =>
                          updateSelectedColumn("validation", {
                            ...selectedColumn.validation,
                            maxNumber:
                              event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Строка</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">
                Свойства выбранного показателя
              </h2>

              <div className="mt-5 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Название строки</span>
                  <input
                    value={selectedRow.label}
                    disabled={isPublished}
                    onChange={(event) => updateSelectedRow("label", event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Ключ строки</span>
                  <input
                    value={selectedRow.key}
                    disabled={isPublished}
                    onChange={(event) => updateSelectedRow("key", event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Комментарий</span>
                  <textarea
                    rows={4}
                    value={selectedRow.description ?? ""}
                    disabled={isPublished}
                    onChange={(event) =>
                      updateSelectedRow("description", event.target.value || null)
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                  />
                </label>

                {table.descriptorColumns.length > 0 ? (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-700">
                      Значения служебных колонок
                    </p>
                    {table.descriptorColumns.map((column) => (
                      <label key={column.id} className="block space-y-2">
                        <span className="text-sm font-medium text-slate-700">
                          {column.label}
                        </span>
                        <input
                          value={selectedRow.descriptorValues?.[column.id] ?? ""}
                          disabled={isPublished}
                          onChange={(event) =>
                            updateSelectedRowDescriptorValue(column.id, event.target.value)
                          }
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

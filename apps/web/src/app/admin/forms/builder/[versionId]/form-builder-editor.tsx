"use client";

import { useMemo, useState } from "react";
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

import {
  FormBuilderSchema,
  FormTableColumn,
  FormTableRow,
} from "@/lib/form-builder/schema";

type VersionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

function SortableColumnChip({
  column,
  isSelected,
  onSelect,
}: {
  column: FormTableColumn;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: column.id,
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
      <span className="font-medium">{column.label}</span>
      <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
        {column.fieldType}
      </span>
    </button>
  );
}

function SortableRowChip({
  row,
  isSelected,
  onSelect,
}: {
  row: FormTableRow;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: row.id,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border px-4 py-3 text-left shadow-sm transition ${
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
      <span className="block font-medium">{row.label}</span>
      <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
        {row.key}
      </span>
    </button>
  );
}

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
  publishedMeta: {
    fullName: string;
    publishedAtLabel: string;
  } | null;
  saveAction: (formData: FormData) => void | Promise<void>;
  publishAction: (formData: FormData) => void | Promise<void>;
};

export function FormBuilderEditor({
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
  publishedMeta,
  saveAction,
  publishAction,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [schema, setSchema] = useState<FormBuilderSchema>(initialSchema);
  const [selectedColumnId, setSelectedColumnId] = useState(
    initialSchema.tables[0]?.columns[0]?.id ?? null,
  );
  const [selectedRowId, setSelectedRowId] = useState(
    initialSchema.tables[0]?.rows[0]?.id ?? null,
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const table = schema.tables[0];
  const selectedColumn =
    table.columns.find((column) => column.id === selectedColumnId) ?? table.columns[0];
  const selectedRow = table.rows.find((row) => row.id === selectedRowId) ?? table.rows[0];
  const isPublished = versionStatus === "PUBLISHED";

  const serializedSchema = useMemo(() => {
    return JSON.stringify({
      ...schema,
      meta: {
        ...schema.meta,
        title,
      },
    });
  }, [schema, title]);

  function updateTable(
    updater: (currentTable: FormBuilderSchema["tables"][number]) => FormBuilderSchema["tables"][number],
  ) {
    setSchema((currentSchema) => ({
      ...currentSchema,
      tables: [updater(currentSchema.tables[0])],
    }));
  }

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    updateTable((currentTable) => {
      const oldIndex = currentTable.columns.findIndex((column) => column.id === active.id);
      const newIndex = currentTable.columns.findIndex((column) => column.id === over.id);

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

    updateTable((currentTable) => {
      const oldIndex = currentTable.rows.findIndex((row) => row.id === active.id);
      const newIndex = currentTable.rows.findIndex((row) => row.id === over.id);

      return {
        ...currentTable,
        rows: arrayMove(currentTable.rows, oldIndex, newIndex),
      };
    });
  }

  function addColumn() {
    updateTable((currentTable) => {
      const nextIndex = currentTable.columns.length + 1;
      const nextColumn: FormTableColumn = {
        id: `column_${nextIndex}`,
        key: `value_${nextIndex}`,
        label: `Значение ${nextIndex}`,
        fieldType: "number",
        unit: "шт.",
        required: false,
        width: 220,
        sticky: false,
        placeholder: null,
        helpText: null,
        options: [],
      };

      setSelectedColumnId(nextColumn.id);

      return {
        ...currentTable,
        columns: [...currentTable.columns, nextColumn],
      };
    });
  }

  function addRow() {
    updateTable((currentTable) => {
      const nextIndex = currentTable.rows.length + 1;
      const nextRow: FormTableRow = {
        id: `row_${nextIndex}`,
        key: `indicator_${nextIndex}`,
        label: `Показатель ${nextIndex}`,
        description: null,
      };

      setSelectedRowId(nextRow.id);

      return {
        ...currentTable,
        rows: [...currentTable.rows, nextRow],
      };
    });
  }

  function updateSelectedColumn<K extends keyof FormTableColumn>(key: K, value: FormTableColumn[K]) {
    updateTable((currentTable) => ({
      ...currentTable,
      columns: currentTable.columns.map((column) =>
        column.id === selectedColumn.id ? { ...column, [key]: value } : column,
      ),
    }));
  }

  function updateSelectedRow<K extends keyof FormTableRow>(key: K, value: FormTableRow[K]) {
    updateTable((currentTable) => ({
      ...currentTable,
      rows: currentTable.rows.map((row) =>
        row.id === selectedRow.id ? { ...row, [key]: value } : row,
      ),
    }));
  }

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
                  isPublished
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
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
                disabled={isPublished}
                className="rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Сохранить черновик
              </button>
            </form>

            <form action={publishAction} className="contents">
              <input type="hidden" name="versionId" value={versionId} />
              <button
                type="submit"
                disabled={isPublished}
                className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Опубликовать версию
              </button>
            </form>
          </div>
        </div>

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

        {publishedMeta ? (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Опубликовано: {publishedMeta.publishedAtLabel} пользователем {publishedMeta.fullName}.
          </p>
        ) : (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Сначала сохраните черновик, затем публикуйте. После публикации прямое редактирование блокируется.
          </p>
        )}
      </section>

      <div className="grid gap-6 2xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Строки</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">Показатели</h2>
            </div>
            <button
              type="button"
              onClick={addRow}
              disabled={isPublished}
              className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              Добавить
            </button>
          </div>

          <div className="mt-5">
            <DndContext
              id="form-builder-rows"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleRowDragEnd}
            >
              <SortableContext items={table.rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {table.rows.map((row) => (
                    <SortableRowChip
                      key={row.id}
                      row={row}
                      isSelected={row.id === selectedRow.id}
                      onSelect={() => setSelectedRowId(row.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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
            <button
              type="button"
              onClick={addColumn}
              disabled={isPublished}
              className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              Добавить
            </button>
          </div>

          <div className="mt-5">
            <DndContext
              id="form-builder-columns"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleColumnDragEnd}
            >
              <SortableContext items={table.columns.map((column) => column.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {table.columns.map((column) => (
                    <SortableColumnChip
                      key={column.id}
                      column={column}
                      isSelected={column.id === selectedColumn.id}
                      onSelect={() => setSelectedColumnId(column.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-200">
            <table className="min-w-[960px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 min-w-[280px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700">
                    Показатель
                  </th>
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
                          {column.fieldType}
                          {column.unit ? ` / ${column.unit}` : ""}
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
                    {table.columns.map((column) => (
                      <td key={`${row.id}-${column.id}`} className="border-b border-slate-200 px-4 py-4">
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
                    updateSelectedColumn("fieldType", event.target.value as FormTableColumn["fieldType"])
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

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Единица измерения</span>
                <input
                  value={selectedColumn.unit ?? ""}
                  disabled={isPublished}
                  onChange={(event) => updateSelectedColumn("unit", event.target.value || null)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Подсказка в ячейке</span>
                <input
                  value={selectedColumn.placeholder ?? ""}
                  disabled={isPublished}
                  onChange={(event) => updateSelectedColumn("placeholder", event.target.value || null)}
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
                  onChange={(event) => updateSelectedColumn("width", Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                />
              </label>
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
                  onChange={(event) => updateSelectedRow("description", event.target.value || null)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

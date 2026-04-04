"use client";

import {
  ButtonHTMLAttributes,
  ChangeEvent,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { clsx } from "clsx";

import { FormBuilderSchema } from "@/lib/form-builder/schema";
import {
  getDescriptorDisplayValue,
  getRuntimeCellFieldKey,
  RuntimeValueMap,
} from "@/lib/form-builder/runtime";

type Props = {
  schema: FormBuilderSchema;
  values: RuntimeValueMap;
  onValueChange?: (fieldKey: string, value: string | boolean) => void;
  readOnly?: boolean;
  errors?: Record<string, string>;
  structureEditing?: {
    onUpdateTableTitle?: (tableId: string, title: string) => void;
    getTableTitleInputClassName?: (tableId: string) => string | undefined;
    onUpdateRowLabel: (tableId: string, rowId: string, label: string) => void;
    getRowLabelInputClassName?: (tableId: string, rowId: string) => string | undefined;
    onInsertRow?: (
      tableId: string,
      anchorRowId: string,
      position: "before" | "after",
    ) => void;
    onDeleteRow?: (tableId: string, rowId: string) => void;
    onUpdateDescriptorColumnLabel: (
      tableId: string,
      columnId: string,
      label: string,
    ) => void;
    getDescriptorColumnInputClassName?: (tableId: string, columnId: string) => string | undefined;
    onInsertDescriptorColumn?: (
      tableId: string,
      anchorColumnId: string,
      position: "before" | "after",
    ) => void;
    onDeleteDescriptorColumn?: (tableId: string, columnId: string) => void;
    onUpdateInputColumnLabel: (
      tableId: string,
      columnId: string,
      label: string,
    ) => void;
    getInputColumnInputClassName?: (tableId: string, columnId: string) => string | undefined;
    onInsertInputColumn?: (
      tableId: string,
      anchorColumnId: string,
      position: "before" | "after",
    ) => void;
    onDeleteInputColumn?: (tableId: string, columnId: string) => void;
  };
};

type VirtualRowsState = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  isEnabled: boolean;
};

function useVirtualRows(rowCount: number, enabled: boolean): VirtualRowsState {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(720);
  const estimatedRowHeight = 84;
  const overscan = 12;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    function updateViewportHeight() {
      const nextContainer = containerRef.current;
      setViewportHeight(nextContainer?.clientHeight || 720);
    }

    updateViewportHeight();
    const resizeObserver = new ResizeObserver(updateViewportHeight);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  function onScroll() {
    if (!enabled) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      setScrollTop(container.scrollTop);
    });
  }

  if (!enabled) {
    return {
      containerRef,
      onScroll,
      startIndex: 0,
      endIndex: rowCount,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      isEnabled: false,
    };
  }

  const visibleCount = Math.max(Math.ceil(viewportHeight / estimatedRowHeight), 1);
  const startIndex = Math.max(Math.floor(scrollTop / estimatedRowHeight) - overscan, 0);
  const endIndex = Math.min(startIndex + visibleCount + overscan * 2, rowCount);
  const topSpacerHeight = startIndex * estimatedRowHeight;
  const bottomSpacerHeight = Math.max((rowCount - endIndex) * estimatedRowHeight, 0);

  return {
    containerRef,
    onScroll,
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    isEnabled: true,
  };
}

function getRowLabel(row: FormBuilderSchema["tables"][number]["rows"][number]) {
  return [row.groupPrefix, row.label].filter(Boolean).join(" ");
}

function getRowLabelCellClass(row: FormBuilderSchema["tables"][number]["rows"][number]) {
  if (row.rowType === "group") {
    return "font-semibold text-slate-950";
  }

  if (row.rowType === "subgroup") {
    return "font-medium text-slate-900";
  }

  if (row.rowType === "service") {
    return "font-medium italic text-slate-700";
  }

  return "font-medium text-slate-900";
}

function TableActionButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={clsx(
        "rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400",
        className,
      )}
    />
  );
}

const RuntimeFieldInput = memo(function RuntimeFieldInput({
  fieldKey,
  fieldType,
  value,
  readOnly = false,
  placeholder,
  helpText,
  options,
  required = false,
  error,
  onValueChange,
}: {
  fieldKey: string;
  fieldType: string;
  value: string | boolean | number | null | undefined;
  readOnly?: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  error?: string;
  onValueChange?: (fieldKey: string, value: string | boolean) => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocusedRef = useRef(false);
  const [localValue, setLocalValue] = useState<string | boolean | number | null | undefined>(
    value,
  );

  const commonClassName = clsx(
    "w-full rounded-2xl border bg-white px-3 py-3 text-sm text-slate-900 transition outline-none",
    error
      ? "border-red-300 focus:border-red-400"
      : "border-slate-300 focus:border-blue-500",
    readOnly && "cursor-not-allowed bg-slate-50 text-slate-500",
  );

  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalValue(value);
    }
  }, [fieldKey, value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function flushValue(nextValue: string | boolean | number | null | undefined) {
    if (!onValueChange) {
      return;
    }

    if (fieldType === "checkbox") {
      onValueChange(fieldKey, Boolean(nextValue));
      return;
    }

    onValueChange(
      fieldKey,
      typeof nextValue === "boolean" ? String(nextValue) : String(nextValue ?? ""),
    );
  }

  function scheduleCommit(nextValue: string | boolean | number | null | undefined, immediate = false) {
    if (!onValueChange) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (immediate || fieldType === "checkbox" || fieldType === "select" || fieldType === "date") {
      flushValue(nextValue);
      return;
    }

    debounceRef.current = setTimeout(() => {
      flushValue(nextValue);
    }, 180);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    if (fieldType === "checkbox" && event.target instanceof HTMLInputElement) {
      setLocalValue(event.target.checked);
      scheduleCommit(event.target.checked, true);
      return;
    }

    setLocalValue(event.target.value);
    scheduleCommit(
      event.target.value,
      event.target instanceof HTMLSelectElement || fieldType === "date",
    );
  }

  function handleFocus() {
    isFocusedRef.current = true;
  }

  function handleBlur() {
    isFocusedRef.current = false;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    flushValue(localValue);
  }

  if (fieldType === "textarea") {
    return (
      <div className="space-y-1">
        <textarea
          rows={3}
          value={typeof localValue === "string" ? localValue : ""}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={readOnly}
          placeholder={placeholder ?? undefined}
          className={commonClassName}
        />
        {helpText ? <p className="text-xs text-slate-500">{helpText}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  if (fieldType === "select") {
    return (
      <div className="space-y-1">
        <select
          value={typeof localValue === "string" ? localValue : ""}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={readOnly}
          className={commonClassName}
        >
          <option value="">
            {required ? "Выберите значение *" : "Выберите значение"}
          </option>
          {(options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {helpText ? <p className="text-xs text-slate-500">{helpText}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  if (fieldType === "checkbox") {
    return (
      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
        <input
          type="checkbox"
          checked={Boolean(localValue)}
          onChange={handleChange}
          onFocus={handleFocus}
          disabled={readOnly}
          className="h-4 w-4 rounded border-slate-300"
        />
        <span className="text-sm text-slate-700">{helpText || "Да / Нет"}</span>
      </label>
    );
  }

  return (
    <div className="space-y-1">
      <input
        type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
        step={fieldType === "number" ? "any" : undefined}
        value={
          typeof localValue === "string" || typeof localValue === "number" ? localValue : ""
        }
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={readOnly}
        placeholder={placeholder ?? undefined}
        className={commonClassName}
      />
      {helpText ? <p className="text-xs text-slate-500">{helpText}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.fieldKey === nextProps.fieldKey &&
    prevProps.fieldType === nextProps.fieldType &&
    prevProps.value === nextProps.value &&
    prevProps.readOnly === nextProps.readOnly &&
    prevProps.placeholder === nextProps.placeholder &&
    prevProps.helpText === nextProps.helpText &&
    prevProps.required === nextProps.required &&
    prevProps.error === nextProps.error &&
    prevProps.options === nextProps.options
  );
});

type RuntimeTableRowProps = {
  tableId: string;
  row: FormBuilderSchema["tables"][number]["rows"][number];
  descriptorColumns: FormBuilderSchema["tables"][number]["descriptorColumns"];
  columns: FormBuilderSchema["tables"][number]["columns"];
  values: RuntimeValueMap;
  onValueChange?: (fieldKey: string, value: string | boolean) => void;
  readOnly: boolean;
  errors: Record<string, string>;
  canEditStructure: boolean;
  structureEditing?: Props["structureEditing"];
};

const RuntimeTableRow = memo(function RuntimeTableRow({
  tableId,
  row,
  descriptorColumns,
  columns,
  values,
  onValueChange,
  readOnly,
  errors,
  canEditStructure,
  structureEditing,
}: RuntimeTableRowProps) {
  return (
    <tr>
      <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-4 align-top">
        <div className="space-y-1">
          {canEditStructure ? (
            <div className="space-y-2">
              <input
                value={row.label}
                onChange={(event) =>
                  structureEditing?.onUpdateRowLabel(tableId, row.id, event.target.value)
                }
                className={clsx(
                  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900",
                  getRowLabelCellClass(row),
                  structureEditing?.getRowLabelInputClassName?.(tableId, row.id),
                )}
                style={{ paddingLeft: `${12 + row.indent * 20}px` }}
              />
              {structureEditing?.onInsertRow || structureEditing?.onDeleteRow ? (
                <div className="flex flex-wrap gap-2">
                  {structureEditing?.onInsertRow ? (
                    <>
                      <TableActionButton
                        type="button"
                        onClick={() => structureEditing.onInsertRow?.(tableId, row.id, "before")}
                      >
                        + выше
                      </TableActionButton>
                      <TableActionButton
                        type="button"
                        onClick={() => structureEditing.onInsertRow?.(tableId, row.id, "after")}
                      >
                        + ниже
                      </TableActionButton>
                    </>
                  ) : null}
                  {structureEditing?.onDeleteRow ? (
                    <TableActionButton
                      type="button"
                      onClick={() => structureEditing.onDeleteRow?.(tableId, row.id)}
                      className="border-red-300 text-red-700 hover:bg-red-50"
                    >
                      удалить
                    </TableActionButton>
                  ) : null}
                </div>
              ) : null}
              {row.groupPrefix ? (
                <p className="text-xs text-slate-500">Префикс: {row.groupPrefix}</p>
              ) : null}
            </div>
          ) : (
            <p
              className={getRowLabelCellClass(row)}
              style={{ paddingLeft: `${row.indent * 20}px` }}
            >
              {getRowLabel(row)}
            </p>
          )}
          {row.description ? <p className="text-xs text-slate-500">{row.description}</p> : null}
        </div>
      </td>

      {row.rowType !== "data" ? (
        <td
          colSpan={descriptorColumns.length + columns.length}
          className="border-b border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500"
        >
          {row.rowType === "service"
            ? "Служебная строка без ввода данных."
            : "Групповая строка для визуальной структуры формы."}
        </td>
      ) : (
        <>
          {descriptorColumns.map((column) => (
            <td
              key={`${row.id}-${column.id}`}
              className="border-b border-r border-slate-200 px-4 py-4 text-slate-600"
            >
              {getDescriptorDisplayValue(row.descriptorValues ?? {}, column) ?? "—"}
            </td>
          ))}

          {columns.map((column) => {
            const fieldKey = getRuntimeCellFieldKey({
              tableId,
              rowKey: row.key,
              columnKey: column.key,
            });

            return (
              <td
                key={`${row.id}-${column.id}`}
                className="border-b border-slate-200 px-4 py-4 align-top"
              >
                <RuntimeFieldInput
                  fieldKey={fieldKey}
                  fieldType={column.fieldType}
                  value={values[fieldKey]}
                  onValueChange={onValueChange}
                  readOnly={readOnly}
                  placeholder={column.placeholder}
                  helpText={column.helpText}
                  options={column.options}
                  required={column.required}
                  error={errors[fieldKey]}
                />
              </td>
            );
          })}
        </>
      )}
    </tr>
  );
}, (prevProps, nextProps) => {
  if (
    prevProps.tableId !== nextProps.tableId ||
    prevProps.row !== nextProps.row ||
    prevProps.descriptorColumns !== nextProps.descriptorColumns ||
    prevProps.columns !== nextProps.columns ||
    prevProps.readOnly !== nextProps.readOnly ||
    prevProps.canEditStructure !== nextProps.canEditStructure
  ) {
    return false;
  }

  if (prevProps.row.rowType !== "data") {
    return true;
  }

  for (const column of nextProps.columns) {
    const fieldKey = getRuntimeCellFieldKey({
      tableId: nextProps.tableId,
      rowKey: nextProps.row.key,
      columnKey: column.key,
    });

    if (
      prevProps.values[fieldKey] !== nextProps.values[fieldKey] ||
      prevProps.errors[fieldKey] !== nextProps.errors[fieldKey]
    ) {
      return false;
    }
  }

  return true;
});

export function RuntimeFormRenderer({
  schema,
  values,
  onValueChange,
  readOnly = false,
  errors = {},
  structureEditing,
}: Props) {
  const canEditStructure = Boolean(structureEditing);

  return (
    <div className="space-y-8">
      {schema.headerFields.length > 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Шапка формы</h3>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {schema.headerFields.map((field) => (
              <div key={field.id} className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
                <RuntimeFieldInput
                  fieldKey={field.key}
                  fieldType={field.fieldType}
                  value={values[field.key]}
                  onValueChange={onValueChange}
                  readOnly={readOnly}
                  placeholder={field.placeholder}
                  helpText={field.helpText}
                  options={field.options}
                  required={field.required}
                  error={errors[field.key]}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {schema.tables.map((table) => (
        <RuntimeTableSection
          key={table.id}
          table={table}
          values={values}
          onValueChange={onValueChange}
          readOnly={readOnly}
          errors={errors}
          canEditStructure={canEditStructure}
          structureEditing={structureEditing}
        />
      ))}
    </div>
  );
}

const RuntimeTableSection = memo(function RuntimeTableSection({
  table,
  values,
  onValueChange,
  readOnly,
  errors,
  canEditStructure,
  structureEditing,
}: {
  table: FormBuilderSchema["tables"][number];
  values: RuntimeValueMap;
  onValueChange?: (fieldKey: string, value: string | boolean) => void;
  readOnly: boolean;
  errors: Record<string, string>;
  canEditStructure: boolean;
  structureEditing?: Props["structureEditing"];
}) {
  const shouldVirtualize = table.rows.length > 80;
  const virtualRows = useVirtualRows(table.rows.length, shouldVirtualize);
  const visibleRows = useMemo(
    () => table.rows.slice(virtualRows.startIndex, virtualRows.endIndex),
    [table.rows, virtualRows.endIndex, virtualRows.startIndex],
  );
  const totalColumns = 1 + table.descriptorColumns.length + table.columns.length;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        {canEditStructure && structureEditing?.onUpdateTableTitle ? (
          <input
            value={table.title}
            onChange={(event) => structureEditing.onUpdateTableTitle?.(table.id, event.target.value)}
            className={clsx(
              "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg font-semibold text-slate-950",
              structureEditing.getTableTitleInputClassName?.(table.id),
            )}
          />
        ) : (
          <h3 className="text-lg font-semibold text-slate-950">{table.title}</h3>
        )}
        {table.description ? <p className="mt-2 text-sm text-slate-600">{table.description}</p> : null}
      </div>

      <div
        ref={virtualRows.containerRef}
        onScroll={virtualRows.onScroll}
        className="max-h-[72vh] overflow-auto rounded-3xl border border-slate-200"
      >
        <table className="min-w-[1040px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-[320px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700">
                Наименование
              </th>
              {table.descriptorColumns.map((column) => (
                <th
                  key={column.id}
                  className="sticky top-0 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700"
                  style={{ minWidth: `${column.width}px` }}
                >
                  <div className="space-y-2">
                    {canEditStructure ? (
                      <input
                        value={column.label}
                        onChange={(event) =>
                          structureEditing?.onUpdateDescriptorColumnLabel(
                            table.id,
                            column.id,
                            event.target.value,
                          )
                        }
                        className={clsx(
                          "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900",
                          structureEditing?.getDescriptorColumnInputClassName?.(table.id, column.id),
                        )}
                      />
                    ) : (
                      <p>{column.label}</p>
                    )}
                    {canEditStructure &&
                    (structureEditing?.onInsertDescriptorColumn ||
                      structureEditing?.onDeleteDescriptorColumn) ? (
                      <div className="flex flex-wrap gap-2">
                        {structureEditing?.onInsertDescriptorColumn ? (
                          <>
                            <TableActionButton
                              type="button"
                              onClick={() =>
                                structureEditing.onInsertDescriptorColumn?.(
                                  table.id,
                                  column.id,
                                  "before",
                                )
                              }
                            >
                              + слева
                            </TableActionButton>
                            <TableActionButton
                              type="button"
                              onClick={() =>
                                structureEditing.onInsertDescriptorColumn?.(
                                  table.id,
                                  column.id,
                                  "after",
                                )
                              }
                            >
                              + справа
                            </TableActionButton>
                          </>
                        ) : null}
                        {structureEditing?.onDeleteDescriptorColumn ? (
                          <TableActionButton
                            type="button"
                            onClick={() =>
                              structureEditing.onDeleteDescriptorColumn?.(table.id, column.id)
                            }
                            className="border-red-300 text-red-700 hover:bg-red-50"
                          >
                            удалить
                          </TableActionButton>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </th>
              ))}
              {table.columns.map((column) => (
                <th
                  key={column.id}
                  className="sticky top-0 border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700"
                  style={{ minWidth: `${column.width}px` }}
                >
                  <div className="space-y-1">
                    {canEditStructure ? (
                      <input
                        value={column.label}
                        onChange={(event) =>
                          structureEditing?.onUpdateInputColumnLabel(
                            table.id,
                            column.id,
                            event.target.value,
                          )
                        }
                        className={clsx(
                          "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900",
                          structureEditing?.getInputColumnInputClassName?.(table.id, column.id),
                        )}
                      />
                    ) : (
                      <p>{column.label}</p>
                    )}
                    {(column.unit || column.helpText) ? (
                      <p className="text-xs font-normal text-slate-500">
                        {[column.unit, column.helpText].filter(Boolean).join(" / ")}
                      </p>
                    ) : null}
                    {canEditStructure &&
                    (structureEditing?.onInsertInputColumn || structureEditing?.onDeleteInputColumn) ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {structureEditing?.onInsertInputColumn ? (
                          <>
                            <TableActionButton
                              type="button"
                              onClick={() =>
                                structureEditing.onInsertInputColumn?.(table.id, column.id, "before")
                              }
                            >
                              + слева
                            </TableActionButton>
                            <TableActionButton
                              type="button"
                              onClick={() =>
                                structureEditing.onInsertInputColumn?.(table.id, column.id, "after")
                              }
                            >
                              + справа
                            </TableActionButton>
                          </>
                        ) : null}
                        {structureEditing?.onDeleteInputColumn ? (
                          <TableActionButton
                            type="button"
                            onClick={() =>
                              structureEditing.onDeleteInputColumn?.(table.id, column.id)
                            }
                            className="border-red-300 text-red-700 hover:bg-red-50"
                          >
                            удалить
                          </TableActionButton>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {virtualRows.isEnabled && virtualRows.topSpacerHeight > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={totalColumns} style={{ height: `${virtualRows.topSpacerHeight}px` }} />
              </tr>
            ) : null}

            {visibleRows.map((row) => (
              <RuntimeTableRow
                key={row.id}
                tableId={table.id}
                row={row}
                descriptorColumns={table.descriptorColumns}
                columns={table.columns}
                values={values}
                onValueChange={onValueChange}
                readOnly={readOnly}
                errors={errors}
                canEditStructure={canEditStructure}
                structureEditing={structureEditing}
              />
            ))}

            {virtualRows.isEnabled && virtualRows.bottomSpacerHeight > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={totalColumns} style={{ height: `${virtualRows.bottomSpacerHeight}px` }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
});

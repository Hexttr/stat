"use client";

import { ButtonHTMLAttributes, useState } from "react";
import { clsx } from "clsx";

import {
  FormTableColumn,
  FormTableDescriptorColumn,
  FormTableRow,
  FormTableSchema,
  formTableRowTypeValues,
} from "@/lib/form-builder/schema";

type Props = {
  table: FormTableSchema;
  isPublished: boolean;
  selectedRowId: string | null;
  selectedColumnId: string | null;
  selectedDescriptorColumnId: string | null;
  onSelectRow: (rowId: string) => void;
  onSelectColumn: (columnId: string) => void;
  onSelectDescriptorColumn: (columnId: string) => void;
  onUpdateTableMeta: (patch: Partial<Pick<FormTableSchema, "title" | "description">>) => void;
  onUpdateRow: (rowId: string, patch: Partial<FormTableRow>) => void;
  onUpdateColumn: (columnId: string, patch: Partial<FormTableColumn>) => void;
  onUpdateDescriptorColumn: (
    columnId: string,
    patch: Partial<FormTableDescriptorColumn>,
  ) => void;
  onUpdateDescriptorValue: (rowId: string, descriptorId: string, value: string) => void;
  onAddRow: () => void;
  onDuplicateRow: () => void;
  onDeleteRow: () => void;
  onAddColumn: () => void;
  onDuplicateColumn: () => void;
  onDeleteColumn: () => void;
  onAddDescriptorColumn: () => void;
  onDuplicateDescriptorColumn: () => void;
  onDeleteDescriptorColumn: () => void;
  onApplyBulkRows: (text: string) => void;
  onApplyBulkColumns: (text: string) => void;
  onApplyBulkDescriptorValues: (text: string) => void;
};

function ActionButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={clsx(
        "rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400",
        className,
      )}
    />
  );
}

export function FormBuilderGridEditor({
  table,
  isPublished,
  selectedRowId,
  selectedColumnId,
  selectedDescriptorColumnId,
  onSelectRow,
  onSelectColumn,
  onSelectDescriptorColumn,
  onUpdateTableMeta,
  onUpdateRow,
  onUpdateColumn,
  onUpdateDescriptorColumn,
  onUpdateDescriptorValue,
  onAddRow,
  onDuplicateRow,
  onDeleteRow,
  onAddColumn,
  onDuplicateColumn,
  onDeleteColumn,
  onAddDescriptorColumn,
  onDuplicateDescriptorColumn,
  onDeleteDescriptorColumn,
  onApplyBulkRows,
  onApplyBulkColumns,
  onApplyBulkDescriptorValues,
}: Props) {
  const [bulkRowsText, setBulkRowsText] = useState("");
  const [bulkColumnsText, setBulkColumnsText] = useState("");
  const [bulkDescriptorText, setBulkDescriptorText] = useState("");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Grid Mode</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                Большое редактируемое полотно формы
              </h2>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Название таблицы</span>
              <input
                value={table.title}
                disabled={isPublished}
                onChange={(event) => onUpdateTableMeta({ title: event.target.value })}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Описание таблицы</span>
              <textarea
                rows={3}
                value={table.description ?? ""}
                disabled={isPublished}
                onChange={(event) =>
                  onUpdateTableMeta({ description: event.target.value || null })
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 disabled:bg-slate-50"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ActionButton type="button" onClick={onAddRow} disabled={isPublished}>
              Добавить строку
            </ActionButton>
            <ActionButton type="button" onClick={onDuplicateRow} disabled={isPublished}>
              Дублировать строку
            </ActionButton>
            <ActionButton type="button" onClick={onDeleteRow} disabled={isPublished}>
              Удалить строку
            </ActionButton>
            <ActionButton type="button" onClick={onAddColumn} disabled={isPublished}>
              Добавить графу
            </ActionButton>
            <ActionButton type="button" onClick={onDuplicateColumn} disabled={isPublished}>
              Дублировать графу
            </ActionButton>
            <ActionButton type="button" onClick={onDeleteColumn} disabled={isPublished}>
              Удалить графу
            </ActionButton>
            <ActionButton type="button" onClick={onAddDescriptorColumn} disabled={isPublished}>
              Добавить служебную колонку
            </ActionButton>
            <ActionButton
              type="button"
              onClick={onDuplicateDescriptorColumn}
              disabled={isPublished}
            >
              Дублировать служебную
            </ActionButton>
            <ActionButton
              type="button"
              onClick={onDeleteDescriptorColumn}
              disabled={isPublished}
              className="sm:col-span-2"
            >
              Удалить служебную колонку
            </ActionButton>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Bulk Paste</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">
            Массовая вставка структуры из буфера
          </h3>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Строки показателей</p>
            <textarea
              rows={10}
              value={bulkRowsText}
              onChange={(event) => setBulkRowsText(event.target.value)}
              placeholder="По одной строке на показатель"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
            <ActionButton
              type="button"
              onClick={() => onApplyBulkRows(bulkRowsText)}
              disabled={isPublished || bulkRowsText.trim().length === 0}
            >
              Заменить строки
            </ActionButton>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Заголовки граф</p>
            <textarea
              rows={10}
              value={bulkColumnsText}
              onChange={(event) => setBulkColumnsText(event.target.value)}
              placeholder="Можно вставлять через Enter или Tab"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
            <ActionButton
              type="button"
              onClick={() => onApplyBulkColumns(bulkColumnsText)}
              disabled={isPublished || bulkColumnsText.trim().length === 0}
            >
              Обновить графы
            </ActionButton>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Значения выбранной служебной колонки
            </p>
            <textarea
              rows={10}
              value={bulkDescriptorText}
              onChange={(event) => setBulkDescriptorText(event.target.value)}
              placeholder="Например: номера строк или коды"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
            />
            <ActionButton
              type="button"
              onClick={() => onApplyBulkDescriptorValues(bulkDescriptorText)}
              disabled={
                isPublished ||
                bulkDescriptorText.trim().length === 0 ||
                !selectedDescriptorColumnId
              }
            >
              Заполнить служебную колонку
            </ActionButton>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <table className="min-w-[1500px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 min-w-[120px] border-b border-r border-slate-200 bg-slate-50 px-3 py-3 font-medium text-slate-700">
                  Тип строки
                </th>
                <th className="sticky top-0 z-20 min-w-[100px] border-b border-r border-slate-200 bg-slate-50 px-3 py-3 font-medium text-slate-700">
                  Уровень
                </th>
                <th className="sticky top-0 z-20 min-w-[360px] border-b border-r border-slate-200 bg-slate-50 px-3 py-3 font-medium text-slate-700">
                  Наименование
                </th>
                {table.descriptorColumns.map((column) => (
                  <th
                    key={column.id}
                    className={clsx(
                      "sticky top-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 align-top",
                      selectedDescriptorColumnId === column.id && "bg-blue-50",
                    )}
                    style={{ minWidth: `${Math.max(column.width, 180)}px` }}
                  >
                    <div className="space-y-2">
                      <input
                        value={column.label}
                        disabled={isPublished}
                        onFocus={() => onSelectDescriptorColumn(column.id)}
                        onChange={(event) =>
                          onUpdateDescriptorColumn(column.id, { label: event.target.value })
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                      />
                      <input
                        value={column.key}
                        disabled={isPublished}
                        onFocus={() => onSelectDescriptorColumn(column.id)}
                        onChange={(event) =>
                          onUpdateDescriptorColumn(column.id, { key: event.target.value })
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:bg-slate-50"
                      />
                    </div>
                  </th>
                ))}
                {table.columns.map((column) => (
                  <th
                    key={column.id}
                    className={clsx(
                      "sticky top-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 align-top",
                      selectedColumnId === column.id && "bg-blue-50",
                    )}
                    style={{ minWidth: `${Math.max(column.width, 220)}px` }}
                  >
                    <div className="space-y-2">
                      <input
                        value={column.label}
                        disabled={isPublished}
                        onFocus={() => onSelectColumn(column.id)}
                        onChange={(event) =>
                          onUpdateColumn(column.id, { label: event.target.value })
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          value={column.fieldType}
                          disabled={isPublished}
                          onFocus={() => onSelectColumn(column.id)}
                          onChange={(event) =>
                            onUpdateColumn(column.id, {
                              fieldType: event.target.value as FormTableColumn["fieldType"],
                            })
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:bg-slate-50"
                        >
                          <option value="number">number</option>
                          <option value="text">text</option>
                          <option value="textarea">textarea</option>
                          <option value="select">select</option>
                          <option value="checkbox">checkbox</option>
                          <option value="date">date</option>
                        </select>
                        <input
                          value={column.unit ?? ""}
                          disabled={isPublished}
                          onFocus={() => onSelectColumn(column.id)}
                          onChange={(event) =>
                            onUpdateColumn(column.id, {
                              unit: event.target.value || null,
                            })
                          }
                          placeholder="Ед."
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:bg-slate-50"
                        />
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.id}>
                  <td
                    className={clsx(
                      "sticky left-0 z-20 border-b border-r border-slate-200 bg-white px-3 py-3 align-top",
                      selectedRowId === row.id && "bg-blue-50",
                    )}
                  >
                    <select
                      value={row.rowType}
                      disabled={isPublished}
                      onFocus={() => onSelectRow(row.id)}
                      onChange={(event) =>
                        onUpdateRow(row.id, {
                          rowType: event.target.value as FormTableRow["rowType"],
                        })
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                    >
                      {formTableRowTypeValues.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-r border-slate-200 px-3 py-3 align-top">
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={row.indent}
                      disabled={isPublished}
                      onFocus={() => onSelectRow(row.id)}
                      onChange={(event) =>
                        onUpdateRow(row.id, {
                          indent: Number(event.target.value),
                        })
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                    />
                  </td>
                  <td className="border-b border-r border-slate-200 px-3 py-3 align-top">
                    <div className="space-y-2">
                      <input
                        value={row.label}
                        disabled={isPublished}
                        onFocus={() => onSelectRow(row.id)}
                        onChange={(event) =>
                          onUpdateRow(row.id, {
                            label: event.target.value,
                          })
                        }
                        className={clsx(
                          "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50",
                          selectedRowId === row.id && "border-blue-300",
                        )}
                        style={{ paddingLeft: `${12 + row.indent * 16}px` }}
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={row.groupPrefix ?? ""}
                          disabled={isPublished}
                          onFocus={() => onSelectRow(row.id)}
                          onChange={(event) =>
                            onUpdateRow(row.id, {
                              groupPrefix: event.target.value || null,
                            })
                          }
                          placeholder="Префикс: из них / в том числе"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:bg-slate-50"
                        />
                        <input
                          value={row.key}
                          disabled={isPublished}
                          onFocus={() => onSelectRow(row.id)}
                          onChange={(event) =>
                            onUpdateRow(row.id, {
                              key: event.target.value,
                            })
                          }
                          placeholder="system key"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:bg-slate-50"
                        />
                      </div>
                    </div>
                  </td>

                  {table.descriptorColumns.map((column) => (
                    <td
                      key={`${row.id}-${column.id}`}
                      className={clsx(
                        "border-b border-r border-slate-200 px-3 py-3 align-top",
                        selectedDescriptorColumnId === column.id && "bg-blue-50/50",
                      )}
                    >
                      <input
                        value={row.descriptorValues?.[column.id] ?? ""}
                        disabled={isPublished}
                        onFocus={() => {
                          onSelectRow(row.id);
                          onSelectDescriptorColumn(column.id);
                        }}
                        onChange={(event) =>
                          onUpdateDescriptorValue(row.id, column.id, event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                      />
                    </td>
                  ))}

                  {table.columns.map((column) => (
                    <td
                      key={`${row.id}-${column.id}`}
                      className={clsx(
                        "border-b border-r border-slate-200 px-3 py-3 align-top",
                        selectedColumnId === column.id && "bg-blue-50/50",
                      )}
                    >
                      <div className="space-y-2">
                        <input
                          value={column.placeholder ?? ""}
                          disabled={isPublished}
                          onFocus={() => {
                            onSelectRow(row.id);
                            onSelectColumn(column.id);
                          }}
                          onChange={(event) =>
                            onUpdateColumn(column.id, {
                              placeholder: event.target.value || null,
                            })
                          }
                          placeholder="Подсказка ячейки"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:bg-slate-50"
                        />
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={column.required}
                            disabled={isPublished}
                            onChange={(event) =>
                              onUpdateColumn(column.id, {
                                required: event.target.checked,
                              })
                            }
                            className="h-4 w-4"
                          />
                          обязательная графа
                        </label>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

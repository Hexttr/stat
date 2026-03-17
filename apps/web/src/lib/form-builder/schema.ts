import { z } from "zod";

export const formFieldTypeValues = [
  "text",
  "number",
  "textarea",
  "select",
  "checkbox",
  "date",
] as const;

export const formFieldTypeSchema = z.enum(formFieldTypeValues);

export const tableColumnSchema = z.object({
  id: z.string(),
  key: z.string().min(1),
  label: z.string().min(1),
  fieldType: formFieldTypeSchema,
  unit: z.string().nullable().optional(),
  required: z.boolean().default(false),
  width: z.number().int().min(120).max(480).default(220),
  sticky: z.boolean().default(false),
  placeholder: z.string().nullable().optional(),
  helpText: z.string().nullable().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
});

export const tableRowSchema = z.object({
  id: z.string(),
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
});

export const tableSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  columns: z.array(tableColumnSchema).min(1),
  rows: z.array(tableRowSchema).min(1),
  settings: z.object({
    stickyHeader: z.boolean().default(true),
    stickyFirstColumn: z.boolean().default(true),
    horizontalScroll: z.boolean().default(true),
  }),
});

export const headerFieldSchema = z.object({
  id: z.string(),
  key: z.string().min(1),
  label: z.string().min(1),
  fieldType: formFieldTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().nullable().optional(),
});

export const formBuilderSchema = z.object({
  meta: z.object({
    formCode: z.string().min(1),
    title: z.string().min(1),
    reportingYear: z.number().int(),
    description: z.string().nullable().optional(),
  }),
  headerFields: z.array(headerFieldSchema).default([]),
  tables: z.array(tableSchema).min(1),
});

export type FormBuilderSchema = z.infer<typeof formBuilderSchema>;
export type FormTableSchema = z.infer<typeof tableSchema>;
export type FormTableColumn = z.infer<typeof tableColumnSchema>;
export type FormTableRow = z.infer<typeof tableRowSchema>;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

function createId(prefix: string, index: number) {
  return `${prefix}_${index + 1}`;
}

export function createDefaultFormSchema(params: {
  formCode: string;
  title: string;
  reportingYear: number;
  description?: string | null;
}) {
  const schema: FormBuilderSchema = {
    meta: {
      formCode: params.formCode,
      title: params.title,
      reportingYear: params.reportingYear,
      description: params.description ?? null,
    },
    headerFields: [
      {
        id: "header_region",
        key: "region_name",
        label: "Регион",
        fieldType: "text",
        required: true,
        placeholder: "Наименование региона",
      },
    ],
    tables: [
      {
        id: "table_1",
        title: "Основная таблица",
        description: "Главный блок показателей формы.",
        columns: [
          {
            id: "column_1",
            key: "value_1",
            label: "Значение 1",
            fieldType: "number",
            unit: "шт.",
            required: false,
            width: 220,
            sticky: false,
            placeholder: null,
            helpText: null,
            options: [],
          },
          {
            id: "column_2",
            key: "value_2",
            label: "Значение 2",
            fieldType: "number",
            unit: "шт.",
            required: false,
            width: 220,
            sticky: false,
            placeholder: null,
            helpText: null,
            options: [],
          },
        ],
        rows: [
          {
            id: "row_1",
            key: "indicator_1",
            label: "Показатель 1",
            description: null,
          },
          {
            id: "row_2",
            key: "indicator_2",
            label: "Показатель 2",
            description: null,
          },
        ],
        settings: {
          stickyHeader: true,
          stickyFirstColumn: true,
          horizontalScroll: true,
        },
      },
    ],
  };

  return schema;
}

export function duplicateFormSchema(
  source: FormBuilderSchema,
  params: {
    title: string;
    reportingYear: number;
  },
) {
  return {
    ...source,
    meta: {
      ...source.meta,
      title: params.title,
      reportingYear: params.reportingYear,
    },
  } satisfies FormBuilderSchema;
}

export function normalizeFormSchema(input: FormBuilderSchema) {
  const parsed = formBuilderSchema.parse(input);

  return {
    ...parsed,
    headerFields: parsed.headerFields.map((field, index) => ({
      ...field,
      id: field.id || createId("header", index),
      key: field.key || `${slugify(field.label)}_${index + 1}`,
    })),
    tables: parsed.tables.map((table, tableIndex) => ({
      ...table,
      id: table.id || createId("table", tableIndex),
      columns: table.columns.map((column, columnIndex) => ({
        ...column,
        id: column.id || createId("column", columnIndex),
        key: column.key || `${slugify(column.label)}_${columnIndex + 1}`,
      })),
      rows: table.rows.map((row, rowIndex) => ({
        ...row,
        id: row.id || createId("row", rowIndex),
        key: row.key || `${slugify(row.label)}_${rowIndex + 1}`,
      })),
    })),
  } satisfies FormBuilderSchema;
}

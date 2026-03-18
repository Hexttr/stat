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

export const formTableRowTypeValues = [
  "data",
  "group",
  "subgroup",
  "service",
] as const;

export const formTableRowTypeSchema = z.enum(formTableRowTypeValues);

export const fieldValidationSchema = z.object({
  minNumber: z.number().nullable().optional(),
  maxNumber: z.number().nullable().optional(),
  maxLength: z.number().int().positive().nullable().optional(),
  regexPattern: z.string().nullable().optional(),
  regexMessage: z.string().nullable().optional(),
});

export const selectOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

export const tableDescriptorColumnSchema = z.object({
  id: z.string(),
  key: z.string().min(1),
  label: z.string().min(1),
  width: z.number().int().min(100).max(320).default(140),
  sticky: z.boolean().default(false),
});

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
  options: z.array(selectOptionSchema).default([]),
  validation: fieldValidationSchema.default({}),
});

export const tableRowSchema = z.object({
  id: z.string(),
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  rowType: formTableRowTypeSchema.default("data"),
  indent: z.number().int().min(0).max(6).default(0),
  groupPrefix: z.string().nullable().optional(),
  descriptorValues: z.record(z.string(), z.string().nullable()).default({}),
});

export const tableSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  descriptorColumns: z.array(tableDescriptorColumnSchema).default([]),
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
  helpText: z.string().nullable().optional(),
  options: z.array(selectOptionSchema).default([]),
  validation: fieldValidationSchema.default({}),
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
export type FormTableDescriptorColumn = z.infer<typeof tableDescriptorColumnSchema>;
export type FormTableRow = z.infer<typeof tableRowSchema>;
export type FormFieldValidation = z.infer<typeof fieldValidationSchema>;
export type FormTableRowType = z.infer<typeof formTableRowTypeSchema>;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

function createIndexedId(prefix: string, index: number) {
  return `${prefix}_${index + 1}`;
}

function createUniqueKey(base: string, existing: Set<string>) {
  const normalizedBase = slugify(base) || "field";

  if (!existing.has(normalizedBase)) {
    existing.add(normalizedBase);
    return normalizedBase;
  }

  let counter = 2;
  let candidate = `${normalizedBase}_${counter}`;

  while (existing.has(candidate)) {
    counter += 1;
    candidate = `${normalizedBase}_${counter}`;
  }

  existing.add(candidate);
  return candidate;
}

export function createDefaultHeaderField(index: number) {
  return {
    id: createIndexedId("header", index),
    key: `header_${index + 1}`,
    label: `Поле ${index + 1}`,
    fieldType: "text" as const,
    required: false,
    placeholder: null,
    helpText: null,
    options: [],
    validation: {},
  };
}

export function createDefaultDescriptorColumn(index: number) {
  return {
    id: createIndexedId("descriptor", index),
    key: `descriptor_${index + 1}`,
    label: `Служебная колонка ${index + 1}`,
    width: 140,
    sticky: false,
  };
}

export function createDefaultInputColumn(index: number) {
  return {
    id: createIndexedId("column", index),
    key: `value_${index + 1}`,
    label: `Значение ${index + 1}`,
    fieldType: "number" as const,
    unit: "шт.",
    required: false,
    width: 220,
    sticky: false,
    placeholder: null,
    helpText: null,
    options: [],
    validation: {},
  };
}

export function createDefaultRow(
  index: number,
  descriptorColumns: FormTableDescriptorColumn[] = [],
): FormTableRow {
  return {
    id: createIndexedId("row", index),
    key: `indicator_${index + 1}`,
    label: `Показатель ${index + 1}`,
    description: null,
    rowType: "data",
    indent: 0,
    groupPrefix: null,
    descriptorValues: Object.fromEntries(
      descriptorColumns.map((column) => [column.id, null as string | null]),
    ) as Record<string, string | null>,
  };
}

export function createDefaultTable(index: number): FormTableSchema {
  const descriptorColumns = [
    {
      id: "descriptor_1",
      key: "row_number",
      label: "№ строки",
      width: 120,
      sticky: false,
    },
  ];

  return {
    id: createIndexedId("table", index),
    title: index === 0 ? "Основная таблица" : `Таблица ${index + 1}`,
    description:
      index === 0 ? "Главный блок показателей формы." : `Блок данных ${index + 1}.`,
    descriptorColumns,
    columns: [createDefaultInputColumn(0), createDefaultInputColumn(1)],
    rows: [
      createDefaultRow(0, descriptorColumns),
      createDefaultRow(1, descriptorColumns),
    ],
    settings: {
      stickyHeader: true,
      stickyFirstColumn: true,
      horizontalScroll: true,
    },
  };
}

export function duplicateDescriptorColumn(
  column: FormTableDescriptorColumn,
  existingColumns: FormTableDescriptorColumn[],
) {
  const keySet = new Set(existingColumns.map((item) => item.key));

  return {
    ...column,
    id: createIndexedId("descriptor", existingColumns.length),
    key: createUniqueKey(`${column.key}_copy`, keySet),
    label: `${column.label} (копия)`,
  };
}

export function duplicateInputColumn(
  column: FormTableColumn,
  existingColumns: FormTableColumn[],
) {
  const keySet = new Set(existingColumns.map((item) => item.key));

  return {
    ...column,
    id: createIndexedId("column", existingColumns.length),
    key: createUniqueKey(`${column.key}_copy`, keySet),
    label: `${column.label} (копия)`,
  };
}

export function duplicateTableRow(
  row: FormTableRow,
  existingRows: FormTableRow[],
) {
  const keySet = new Set(existingRows.map((item) => item.key));

  return {
    ...row,
    id: createIndexedId("row", existingRows.length),
    key: createUniqueKey(`${row.key}_copy`, keySet),
    label: `${row.label} (копия)`,
  };
}

export function duplicateTableSchema(
  table: FormTableSchema,
  existingTables: FormTableSchema[],
) {
  const nextTableId = createIndexedId("table", existingTables.length);
  const descriptorIdMap = new Map<string, string>();
  const descriptorColumns = table.descriptorColumns.map((column, columnIndex) => {
    const nextDescriptorId = `${nextTableId}_descriptor_${columnIndex + 1}`;
    descriptorIdMap.set(column.id, nextDescriptorId);

    return {
      ...column,
      id: nextDescriptorId,
      key: `${column.key}_${existingTables.length + 1}`,
    };
  });

  return {
    ...table,
    id: nextTableId,
    title: `${table.title} (копия)`,
    descriptorColumns,
    columns: table.columns.map((column, columnIndex) => ({
      ...column,
      id: `${nextTableId}_column_${columnIndex + 1}`,
      key: `${column.key}_${existingTables.length + 1}`,
    })),
    rows: table.rows.map((row, rowIndex) => ({
      ...row,
      id: `${nextTableId}_row_${rowIndex + 1}`,
      key: `${row.key}_${existingTables.length + 1}`,
      descriptorValues: Object.fromEntries(
        Object.entries(row.descriptorValues ?? {}).map(([descriptorId, value]) => [
          descriptorIdMap.get(descriptorId) ?? descriptorId,
          value,
        ]),
      ),
    })),
  } satisfies FormTableSchema;
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
        helpText: null,
        options: [],
        validation: {},
      },
      {
        id: "header_organization",
        key: "organization_name",
        label: "Наименование организации",
        fieldType: "text",
        required: true,
        placeholder: "Полное наименование",
        helpText: null,
        options: [],
        validation: {},
      },
    ],
    tables: [createDefaultTable(0)],
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

export function getFormSchemaIssues(input: FormBuilderSchema) {
  const issues: string[] = [];
  const headerKeys = new Set<string>();
  const tableIds = new Set<string>();

  input.headerFields.forEach((field) => {
    if (headerKeys.has(field.key)) {
      issues.push(`Повторяющийся ключ поля шапки: ${field.key}`);
    }
    headerKeys.add(field.key);
  });

  input.tables.forEach((table) => {
    if (tableIds.has(table.id)) {
      issues.push(`Повторяющийся идентификатор таблицы: ${table.id}`);
    }
    tableIds.add(table.id);

    const descriptorKeys = new Set<string>();
    const inputKeys = new Set<string>();
    const rowKeys = new Set<string>();

    table.descriptorColumns.forEach((column) => {
      if (descriptorKeys.has(column.key)) {
        issues.push(`В таблице "${table.title}" повторяется ключ служебной колонки: ${column.key}`);
      }
      descriptorKeys.add(column.key);
    });

    table.columns.forEach((column) => {
      if (inputKeys.has(column.key)) {
        issues.push(`В таблице "${table.title}" повторяется ключ вводимой колонки: ${column.key}`);
      }
      inputKeys.add(column.key);

      if (
        column.fieldType === "select" &&
        column.options.some((option, index, options) =>
          options.findIndex((candidate) => candidate.value === option.value) !== index,
        )
      ) {
        issues.push(`В колонке "${column.label}" есть повторяющиеся значения списка.`);
      }
    });

    table.rows.forEach((row) => {
      if (rowKeys.has(row.key)) {
        issues.push(`В таблице "${table.title}" повторяется ключ строки: ${row.key}`);
      }
      rowKeys.add(row.key);

      if (row.rowType !== "data" && row.description && row.description.length > 240) {
        issues.push(`Служебная строка "${row.label}" содержит слишком длинное описание.`);
      }
    });
  });

  return issues;
}

export function normalizeFormSchema(input: FormBuilderSchema) {
  const parsed = formBuilderSchema.parse(input);

  return {
    ...parsed,
    headerFields: parsed.headerFields.map((field, index) => ({
      ...field,
      id: field.id || createIndexedId("header", index),
      key: field.key || `${slugify(field.label)}_${index + 1}`,
      helpText: field.helpText ?? null,
      options: field.options ?? [],
      validation: field.validation ?? {},
    })),
    tables: parsed.tables.map((table, tableIndex) => ({
      ...table,
      id: table.id || createIndexedId("table", tableIndex),
      descriptorColumns: table.descriptorColumns.map((column, columnIndex) => ({
        ...column,
        id: column.id || createIndexedId("descriptor", columnIndex),
        key: column.key || `${slugify(column.label)}_${columnIndex + 1}`,
      })),
      columns: table.columns.map((column, columnIndex) => ({
        ...column,
        id: column.id || createIndexedId("column", columnIndex),
        key: column.key || `${slugify(column.label)}_${columnIndex + 1}`,
        helpText: column.helpText ?? null,
        options: column.options ?? [],
        validation: column.validation ?? {},
      })),
      rows: table.rows.map((row, rowIndex) => ({
        ...row,
        id: row.id || createIndexedId("row", rowIndex),
        key: row.key || `${slugify(row.label)}_${rowIndex + 1}`,
        rowType: row.rowType ?? "data",
        indent: row.indent ?? 0,
        groupPrefix: row.groupPrefix ?? null,
        descriptorValues: Object.fromEntries(
          table.descriptorColumns.map((column) => [
            column.id,
            row.descriptorValues?.[column.id] ?? null,
          ]),
        ),
      })),
    })),
  } satisfies FormBuilderSchema;
}

export function parseAndNormalizeFormSchema(input: unknown) {
  const normalized = normalizeFormSchema(formBuilderSchema.parse(input));
  const issues = getFormSchemaIssues(normalized);

  if (issues.length > 0) {
    throw new z.ZodError(
      issues.map((message) => ({
        code: "custom",
        message,
        path: [],
      })),
    );
  }

  return normalized;
}

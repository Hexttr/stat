import { FormBuilderSchema } from "@/lib/form-builder/schema";

export type ProjectedFormField = {
  key: string;
  label: string;
  section: string | null;
  tableId: string | null;
  rowId: string | null;
  rowKey: string | null;
  columnId: string | null;
  columnKey: string | null;
  fieldPath: string | null;
  fieldType: string;
  unit: string | null;
  placeholder: string | null;
  helpText: string | null;
  sortOrder: number;
  isRequired: boolean;
  validationJson: unknown;
};

export function projectSchemaToFields(schema: FormBuilderSchema): ProjectedFormField[] {
  const headerFields: ProjectedFormField[] = schema.headerFields.map((field, index) => ({
    key: field.key,
    label: field.label,
    section: "header",
    tableId: null,
    rowId: null,
    rowKey: null,
    columnId: null,
    columnKey: null,
    fieldPath: `header.${field.key}`,
    fieldType: field.fieldType,
    unit: null,
    placeholder: field.placeholder ?? null,
    helpText: null,
    sortOrder: index,
    isRequired: field.required,
    validationJson: null,
  }));

  const tableFields = schema.tables.flatMap((table, tableIndex) =>
    table.rows.flatMap((row, rowIndex) =>
      table.columns.map((column, columnIndex) => ({
        key: `${table.id}__${row.key}__${column.key}`,
        label: `${row.label} / ${column.label}`,
        section: table.title,
        tableId: table.id,
        rowId: row.id,
        rowKey: row.key,
        columnId: column.id,
        columnKey: column.key,
        fieldPath: `tables.${table.id}.rows.${row.id}.columns.${column.id}`,
        fieldType: column.fieldType,
        unit: column.unit ?? null,
        placeholder: column.placeholder ?? null,
        helpText: column.helpText ?? null,
        sortOrder: tableIndex * 100000 + rowIndex * 1000 + columnIndex,
        isRequired: column.required,
        validationJson:
          column.fieldType === "select" && column.options.length > 0
            ? { options: column.options }
            : null,
      })),
    ),
  );

  return [...headerFields, ...tableFields];
}

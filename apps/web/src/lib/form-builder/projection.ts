import { FormBuilderSchema } from "@/lib/form-builder/schema";
import { buildRuntimeFieldDefinitions } from "@/lib/form-builder/runtime";

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
  const fields = buildRuntimeFieldDefinitions(schema);

  return fields.map((field, index) => ({
    key: field.key,
    label: field.label,
    section: field.section,
    tableId: field.tableId,
    rowId: field.rowId,
    rowKey: field.rowKey,
    columnId: field.columnId,
    columnKey: field.columnKey,
    fieldPath: field.tableId && field.rowId && field.columnId
      ? `tables.${field.tableId}.rows.${field.rowId}.columns.${field.columnId}`
      : `header.${field.key}`,
    fieldType: field.fieldType,
    unit: field.unit,
    placeholder: field.placeholder,
    helpText: field.helpText,
    sortOrder: index,
    isRequired: field.isRequired,
    validationJson: field.validation,
  }));
}

import {
  FormBuilderSchema,
  FormTableColumn,
  FormTableDescriptorColumn,
} from "@/lib/form-builder/schema";

export type RuntimeFieldDefinition = {
  key: string;
  label: string;
  section: string | null;
  tableId: string | null;
  rowId: string | null;
  rowKey: string | null;
  rowLabel: string | null;
  rowDescription: string | null;
  columnId: string | null;
  columnKey: string | null;
  columnLabel: string | null;
  fieldType: string;
  unit: string | null;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  validation: Record<string, unknown> | null;
  descriptorValues: Record<string, string | null>;
};

export type RuntimeValue = string | number | boolean | null;
export type RuntimeValueMap = Record<string, RuntimeValue>;

export function getRuntimeCellFieldKey(params: {
  tableId: string;
  rowKey: string;
  columnKey: string;
}) {
  return `${params.tableId}__${params.rowKey}__${params.columnKey}`;
}

function serializeValidation(
  field: Pick<FormTableColumn, "fieldType" | "options" | "validation">,
) {
  const payload: Record<string, unknown> = {
    ...(field.validation ?? {}),
  };

  if (field.fieldType === "select" && (field.options ?? []).length > 0) {
    payload.options = field.options;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

export function buildRuntimeFieldDefinitions(
  schema: FormBuilderSchema,
): RuntimeFieldDefinition[] {
  const headerFields = schema.headerFields.map((field) => ({
    key: field.key,
    label: field.label,
    section: "header",
    tableId: null,
    rowId: null,
    rowKey: null,
    rowLabel: null,
    rowDescription: null,
    columnId: null,
    columnKey: null,
    columnLabel: null,
    fieldType: field.fieldType,
    unit: null,
    placeholder: field.placeholder ?? null,
    helpText: field.helpText ?? null,
    isRequired: field.required,
    validation:
      field.fieldType === "select" && (field.options ?? []).length > 0
        ? { ...(field.validation ?? {}), options: field.options }
        : Object.keys(field.validation ?? {}).length > 0
          ? (field.validation ?? {})
          : null,
    descriptorValues: {},
  }));

  const tableFields = schema.tables.flatMap((table) =>
    table.rows.flatMap((row) =>
      row.rowType === "data"
        ? table.columns.map((column) => ({
            key: getRuntimeCellFieldKey({
              tableId: table.id,
              rowKey: row.key,
              columnKey: column.key,
            }),
            label: `${row.label} / ${column.label}`,
            section: table.title,
            tableId: table.id,
            rowId: row.id,
            rowKey: row.key,
            rowLabel: row.label,
            rowDescription: row.description ?? null,
            columnId: column.id,
            columnKey: column.key,
            columnLabel: column.label,
            fieldType: column.fieldType,
            unit: column.unit ?? null,
            placeholder: column.placeholder ?? null,
            helpText: column.helpText ?? null,
            isRequired: column.required,
            validation: serializeValidation(column),
            descriptorValues: row.descriptorValues ?? {},
          }))
        : [],
    ),
  );

  return [...headerFields, ...tableFields];
}

export function getDescriptorDisplayValue(
  rowDescriptorValues: Record<string, string | null>,
  column: FormTableDescriptorColumn,
) {
  return rowDescriptorValues[column.id] ?? null;
}

export function normalizeRuntimeValue(
  fieldType: string,
  rawValue: RuntimeValue,
): {
  valueText?: string | null;
  valueNumber?: string | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
  isEmpty: boolean;
} {
  if (
    rawValue === null ||
    rawValue === undefined ||
    (typeof rawValue === "string" && rawValue.trim() === "")
  ) {
    return {
      valueText: null,
      valueNumber: null,
      valueBoolean: null,
      valueJson: null,
      isEmpty: true,
    };
  }

  if (fieldType === "number") {
    const normalized =
      typeof rawValue === "number"
        ? String(rawValue)
        : String(rawValue).replace(",", ".").trim();

    return {
      valueText: null,
      valueNumber: normalized,
      valueBoolean: null,
      valueJson: null,
      isEmpty: false,
    };
  }

  if (fieldType === "checkbox") {
    return {
      valueText: null,
      valueNumber: null,
      valueBoolean: Boolean(rawValue),
      valueJson: null,
      isEmpty: false,
    };
  }

  return {
    valueText: String(rawValue),
    valueNumber: null,
    valueBoolean: null,
    valueJson: null,
    isEmpty: false,
  };
}

export function getInitialRuntimeValues(
  schema: FormBuilderSchema,
  source?: RuntimeValueMap,
) {
  const fieldEntries = buildRuntimeFieldDefinitions(schema);

  return Object.fromEntries(
    fieldEntries.map((field) => {
      if (source && field.key in source) {
        return [field.key, source[field.key]];
      }

      return [field.key, field.fieldType === "checkbox" ? false : ""];
    }),
  ) satisfies RuntimeValueMap;
}

export function validateRuntimeValues(
  schema: FormBuilderSchema,
  values: RuntimeValueMap,
) {
  const errors: Record<string, string> = {};
  const fieldEntries = buildRuntimeFieldDefinitions(schema);

  for (const field of fieldEntries) {
    const value = values[field.key];
    const isEmpty =
      value === null ||
      value === undefined ||
      value === "" ||
      (field.fieldType === "checkbox" && value === false && field.isRequired);

    if (field.isRequired && isEmpty) {
      errors[field.key] = "Поле обязательно для заполнения.";
      continue;
    }

    if (isEmpty) {
      continue;
    }

    if (field.fieldType === "number") {
      const numericValue =
        typeof value === "number"
          ? value
          : Number(String(value).replace(",", "."));

      if (Number.isNaN(numericValue)) {
        errors[field.key] = "Введите корректное число.";
        continue;
      }

      const minNumber =
        typeof field.validation?.minNumber === "number"
          ? field.validation.minNumber
          : null;
      const maxNumber =
        typeof field.validation?.maxNumber === "number"
          ? field.validation.maxNumber
          : null;

      if (minNumber !== null && numericValue < minNumber) {
        errors[field.key] = `Значение должно быть не меньше ${minNumber}.`;
      }

      if (maxNumber !== null && numericValue > maxNumber) {
        errors[field.key] = `Значение должно быть не больше ${maxNumber}.`;
      }
    }

    if (typeof value === "string") {
      const maxLength =
        typeof field.validation?.maxLength === "number"
          ? field.validation.maxLength
          : null;
      const regexPattern =
        typeof field.validation?.regexPattern === "string"
          ? field.validation.regexPattern
          : null;

      if (maxLength !== null && value.length > maxLength) {
        errors[field.key] = `Максимальная длина: ${maxLength}.`;
      }

      if (regexPattern) {
        const regex = new RegExp(regexPattern);
        if (!regex.test(value)) {
          errors[field.key] =
            typeof field.validation?.regexMessage === "string"
              ? field.validation.regexMessage
              : "Значение не прошло проверку формата.";
        }
      }
    }
  }

  return errors;
}

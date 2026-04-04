"use client";

import { useMemo, useRef, useState } from "react";

import { RuntimeFormRenderer } from "@/components/forms/runtime-form-renderer";
import { FormBuilderSchema } from "@/lib/form-builder/schema";
import {
  getInitialRuntimeValues,
  RuntimeValueMap,
  validateRuntimeValues,
} from "@/lib/form-builder/runtime";

type Props = {
  assignmentId: string;
  schema: FormBuilderSchema;
  initialValues: RuntimeValueMap;
  readOnly?: boolean;
  saveAction: (formData: FormData) => void | Promise<void>;
  submitAction: (formData: FormData) => void | Promise<void>;
  errorMessage?: string | null;
  saveButtonLabel?: string;
  submitButtonLabel?: string;
  helperNotice?: string | null;
};

export function OperatorAssignmentForm({
  assignmentId,
  schema,
  initialValues,
  readOnly = false,
  saveAction,
  submitAction,
  errorMessage,
  saveButtonLabel = "Сохранить черновик",
  submitButtonLabel = "Отправить на проверку",
  helperNotice,
}: Props) {
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const [values, setValues] = useState<RuntimeValueMap>(
    getInitialRuntimeValues(schema, initialValues),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const serializedValues = useMemo(() => JSON.stringify(values), [values]);

  function handleValueChange(fieldKey: string, value: string | boolean) {
    setValues((currentValues) => ({
      ...currentValues,
      [fieldKey]: value,
    }));

    setErrors((currentErrors) => {
      if (!(fieldKey in currentErrors)) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[fieldKey];
      return nextErrors;
    });
  }

  function handleSubmitForReview() {
    const runtimeErrors = validateRuntimeValues(schema, values);
    setErrors(runtimeErrors);

    if (Object.keys(runtimeErrors).length > 0) {
      return;
    }

    submitButtonRef.current?.click();
  }

  return (
    <form className="space-y-6">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="valuesJson" value={serializedValues} />

      {errorMessage ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {helperNotice ? (
        <p className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {helperNotice}
        </p>
      ) : null}

      <RuntimeFormRenderer
        schema={schema}
        values={values}
        onValueChange={readOnly ? undefined : handleValueChange}
        readOnly={readOnly}
        errors={errors}
      />

      {!readOnly ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            formAction={saveAction}
            className="rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800"
          >
            {saveButtonLabel}
          </button>
          <button
            type="button"
            onClick={handleSubmitForReview}
            className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700"
          >
            {submitButtonLabel}
          </button>
          <button ref={submitButtonRef} type="submit" formAction={submitAction} hidden />
        </div>
      ) : null}
    </form>
  );
}

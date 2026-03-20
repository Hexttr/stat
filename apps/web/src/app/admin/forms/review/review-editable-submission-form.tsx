"use client";

import { useMemo, useState } from "react";

import { RuntimeFormRenderer } from "@/components/forms/runtime-form-renderer";
import { FormBuilderSchema } from "@/lib/form-builder/schema";
import { getInitialRuntimeValues, RuntimeValueMap } from "@/lib/form-builder/runtime";

type Props = {
  submissionId: string;
  returnTo: string;
  schema: FormBuilderSchema;
  initialValues: RuntimeValueMap;
  saveAction: (formData: FormData) => void | Promise<void>;
  errorMessage?: string | null;
};

export function ReviewEditableSubmissionForm({
  submissionId,
  returnTo,
  schema,
  initialValues,
  saveAction,
  errorMessage,
}: Props) {
  const [values, setValues] = useState<RuntimeValueMap>(
    getInitialRuntimeValues(schema, initialValues),
  );

  const serializedValues = useMemo(() => JSON.stringify(values), [values]);

  function handleValueChange(fieldKey: string, value: string | boolean) {
    setValues((currentValues) => ({
      ...currentValues,
      [fieldKey]: value,
    }));
  }

  return (
    <form className="space-y-6">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="valuesJson" value={serializedValues} />

      {errorMessage ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      <RuntimeFormRenderer
        schema={schema}
        values={values}
        onValueChange={handleValueChange}
      />

      <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex justify-end lg:right-10">
        <button
          type="submit"
          formAction={saveAction}
          className="pointer-events-auto rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white shadow-2xl shadow-slate-900/20 transition hover:bg-slate-800"
        >
          Сохранить изменения
        </button>
      </div>
    </form>
  );
}

"use client";

import { useMemo, useState } from "react";

import { ArchiveStructureEditor } from "@/app/admin/archive/qa/archive-structure-editor";
import { RuntimeFormRenderer } from "@/components/forms/runtime-form-renderer";
import { ArchiveStructureOverrideTargetType } from "@/generated/prisma/client";
import { FormBuilderSchema } from "@/lib/form-builder/schema";
import { getInitialRuntimeValues, RuntimeValueMap } from "@/lib/form-builder/runtime";

type Props = {
  submissionId: string;
  returnTo: string;
  schema: FormBuilderSchema;
  initialValues: RuntimeValueMap;
  saveAction: (formData: FormData) => void | Promise<void>;
  structureSaveAction: (formData: FormData) => void | Promise<void>;
  formTypeId: string;
  reportingYearId: string;
  structureEntries: Array<{
    targetType: ArchiveStructureOverrideTargetType;
    tableId: string;
    rowKey: string | null;
    columnKey: string | null;
    originalLabel: string;
    currentLabel: string;
    overrideId: string | null;
    note: string | null;
  }>;
  errorMessage?: string | null;
};

export function ReviewEditableSubmissionForm({
  submissionId,
  returnTo,
  schema,
  initialValues,
  saveAction,
  structureSaveAction,
  formTypeId,
  reportingYearId,
  structureEntries,
  errorMessage,
}: Props) {
  const [mode, setMode] = useState<"data" | "structure">("data");
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
    <div className="space-y-6">
      <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setMode("data")}
          className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
            mode === "data"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Режим проверки: данные
        </button>
        <button
          type="button"
          onClick={() => setMode("structure")}
          className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
            mode === "structure"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Режим проверки: структура
        </button>
      </div>

      {errorMessage ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      {mode === "data" ? (
        <form className="space-y-6">
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="valuesJson" value={serializedValues} />

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
              Сохранить изменения значений
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            В этом режиме редактируются только подписи таблиц, строк и столбцов. Сохранение
            применяет изменения ко всей форме этого года, а не только к текущему `Submission`.
          </div>
          <ArchiveStructureEditor
            schema={schema}
            entries={structureEntries}
            formTypeId={formTypeId}
            reportingYearId={reportingYearId}
            returnTo={returnTo}
            saveAction={structureSaveAction}
          />
        </div>
      )}
    </div>
  );
}

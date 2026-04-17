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
  canEditStructure: boolean;
  workflowLabel: string;
  nextStepLabel: string;
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
  canEditStructure,
  workflowLabel,
  nextStepLabel,
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
      {mode === "structure" ? (
        <div className="pointer-events-none fixed right-6 top-24 z-50 lg:right-10">
          <div className="rounded-2xl border border-amber-300 bg-amber-50/95 px-4 py-3 shadow-xl backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Активный режим
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-950">Структура</p>
            <p className="mt-1 max-w-[240px] text-xs leading-5 text-amber-800">
              Изменения применяются ко всей форме этого года, а не только к текущей записи.
            </p>
          </div>
        </div>
      ) : null}

      <section className="rounded-3xl border-2 border-[#d6e6f5] bg-gradient-to-r from-[#eef5fb] to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#1f67ab]">
              Режим проверки
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              Маршрут: {workflowLabel}. Следующий шаг: {nextStepLabel}
            </p>
          </div>
          <div className={`grid w-full gap-3 ${canEditStructure ? "sm:grid-cols-2" : ""} lg:w-auto`}>
            <button
              type="button"
              onClick={() => setMode("data")}
              className={`rounded-2xl border px-5 py-4 text-left transition ${
                mode === "data"
                  ? "border-[#1f67ab] bg-[#1f67ab] text-white shadow-lg shadow-[#1f67ab]/20"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <p className="text-base font-semibold">Данные</p>
              <p className={`mt-1 text-sm ${mode === "data" ? "text-blue-100" : "text-slate-500"}`}>
                Изменение значений только в текущем `Submission`.
              </p>
            </button>
            {canEditStructure ? (
              <button
                type="button"
                onClick={() => setMode("structure")}
                className={`rounded-2xl border px-5 py-4 text-left transition ${
                  mode === "structure"
                    ? "border-[#1f67ab] bg-[#1f67ab] text-white shadow-lg shadow-[#1f67ab]/20"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <p className="text-base font-semibold">Структура</p>
                <p
                  className={`mt-1 text-sm ${
                    mode === "structure" ? "text-blue-100" : "text-slate-500"
                  }`}
                >
                  Изменение названий строк и столбцов для всей формы этого года.
                </p>
              </button>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-100 px-5 py-4 text-left text-slate-500">
                <p className="text-base font-semibold">Структура</p>
                <p className="mt-1 text-sm">
                  Глобальные правки структуры доступны только суперадмину.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {errorMessage ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      {mode === "data" ? (
        <form action={saveAction} className="space-y-6">
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
              className="pointer-events-auto rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white shadow-2xl shadow-slate-900/20 transition hover:bg-slate-800"
            >
              Сохранить изменения значений
            </button>
          </div>
        </form>
      ) : canEditStructure ? (
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
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          Режим структуры скрыт для вашей роли. Здесь можно проверять и править только значения
          текущей отправки.
        </div>
      )}
    </div>
  );
}

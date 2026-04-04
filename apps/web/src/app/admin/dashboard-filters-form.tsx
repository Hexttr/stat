"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

type RegionOption = {
  id: string;
  shortName: string;
};

type FormOption = {
  id: string;
  code: string;
  name: string;
};

type MetricOption = {
  id: string;
  name: string;
  formTypeId: string;
};

type FilterOption = {
  id: string;
  label: string;
  isDefault: boolean;
};

type FormFilter = {
  id: string;
  label: string;
  options: FilterOption[];
};

function buildFilterSelectionMap(filters: FormFilter[], selectedOptionIds: string[]) {
  const nextSelections: Record<string, string> = {};

  for (const filter of filters) {
    const explicitOptionId = selectedOptionIds.find((optionId) =>
      filter.options.some((option) => option.id === optionId),
    );
    const defaultOptionId =
      explicitOptionId ??
      filter.options.find((option) => option.isDefault)?.id ??
      filter.options[0]?.id ??
      "";

    if (defaultOptionId) {
      nextSelections[filter.id] = defaultOptionId;
    }
  }

  return nextSelections;
}

export function DashboardFiltersForm(props: {
  canSelectAnyRegion: boolean;
  regions: RegionOption[];
  forms: FormOption[];
  metrics: MetricOption[];
  filtersByFormTypeId: Record<string, FormFilter[]>;
  years: number[];
  selectedRegionId: string;
  selectedFormId: string;
  selectedMetricId: string;
  selectedYearFrom: number;
  selectedYearTo: number;
  selectedFilterOptionIds: string[];
  view: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [selectedRegionId, setSelectedRegionId] = useState(props.selectedRegionId);
  const [selectedFormId, setSelectedFormId] = useState(props.selectedFormId);
  const [selectedMetricId, setSelectedMetricId] = useState(props.selectedMetricId);
  const [selectedYearFrom, setSelectedYearFrom] = useState(String(props.selectedYearFrom));
  const [selectedYearTo, setSelectedYearTo] = useState(String(props.selectedYearTo));
  const [selectedFilterMap, setSelectedFilterMap] = useState<Record<string, string>>(() =>
    buildFilterSelectionMap(
      props.filtersByFormTypeId[props.selectedFormId] ?? [],
      props.selectedFilterOptionIds,
    ),
  );

  const metricsForSelectedForm = useMemo(
    () => props.metrics.filter((metric) => metric.formTypeId === selectedFormId),
    [props.metrics, selectedFormId],
  );
  const filtersForSelectedForm = props.filtersByFormTypeId[selectedFormId] ?? [];

  function navigate(nextState: {
    regionId: string;
    formTypeId: string;
    metricId: string;
    yearFrom: string;
    yearTo: string;
    filterMap: Record<string, string>;
  }) {
    const searchParams = new URLSearchParams();

    if (props.view) {
      searchParams.set("view", props.view);
    }

    searchParams.set("regionId", nextState.regionId);
    searchParams.set("formTypeId", nextState.formTypeId);

    if (nextState.metricId) {
      searchParams.set("metricId", nextState.metricId);
    }

    searchParams.set("yearFrom", nextState.yearFrom);
    searchParams.set("yearTo", nextState.yearTo);

    for (const optionId of Object.values(nextState.filterMap)) {
      if (optionId) {
        searchParams.append("filterOptionIds", optionId);
      }
    }

    const query = searchParams.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function applyState(nextState: {
    regionId?: string;
    formTypeId?: string;
    metricId?: string;
    yearFrom?: string;
    yearTo?: string;
    filterMap?: Record<string, string>;
  }) {
    const resolvedState = {
      regionId: nextState.regionId ?? selectedRegionId,
      formTypeId: nextState.formTypeId ?? selectedFormId,
      metricId: nextState.metricId ?? selectedMetricId,
      yearFrom: nextState.yearFrom ?? selectedYearFrom,
      yearTo: nextState.yearTo ?? selectedYearTo,
      filterMap: nextState.filterMap ?? selectedFilterMap,
    };

    navigate(resolvedState);
  }

  return (
    <form className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_220px]">
        <select
          name="regionId"
          value={selectedRegionId}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedRegionId(value);
            applyState({ regionId: value });
          }}
          className="h-14 rounded-2xl border-0 bg-white px-5 text-[15px] font-medium text-slate-800 outline-none"
        >
          {props.canSelectAnyRegion ? <option value="RUSSIAN_FEDERATION">Российская Федерация</option> : null}
          {props.regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.shortName}
            </option>
          ))}
        </select>

        <select
          name="formTypeId"
          value={selectedFormId}
          onChange={(event) => {
            const nextFormId = event.target.value;
            const nextMetrics = props.metrics.filter((metric) => metric.formTypeId === nextFormId);
            const nextMetricId = nextMetrics[0]?.id ?? "";
            const nextFilters = props.filtersByFormTypeId[nextFormId] ?? [];
            const nextFilterMap = buildFilterSelectionMap(nextFilters, []);

            setSelectedFormId(nextFormId);
            setSelectedMetricId(nextMetricId);
            setSelectedFilterMap(nextFilterMap);

            applyState({
              formTypeId: nextFormId,
              metricId: nextMetricId,
              filterMap: nextFilterMap,
            });
          }}
          className="h-14 rounded-2xl border-0 bg-white px-5 text-[15px] font-medium text-slate-800 outline-none"
        >
          {props.forms.length === 0 ? <option value="">Нет настроенных форм</option> : null}
          {props.forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.code} - {form.name}
            </option>
          ))}
        </select>

        <select
          name="metricId"
          value={selectedMetricId}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedMetricId(value);
            applyState({ metricId: value });
          }}
          className="h-14 rounded-2xl border-0 bg-white px-5 text-[15px] font-medium text-slate-800 outline-none"
        >
          {metricsForSelectedForm.length === 0 ? <option value="">Выберите форму</option> : null}
          {metricsForSelectedForm.map((metric) => (
            <option key={metric.id} value={metric.id}>
              {metric.name}
            </option>
          ))}
        </select>

        <div className="flex items-center rounded-2xl bg-[#3d84c7] px-5 text-sm font-medium text-white">
          {isPending ? "Обновляем..." : "Фильтры применяются автоматически"}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[180px_180px_1fr]">
        <select
          name="yearFrom"
          value={selectedYearFrom}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedYearFrom(value);
            applyState({ yearFrom: value });
          }}
          className="h-14 rounded-2xl border-0 bg-white px-5 text-[15px] font-medium text-slate-800 outline-none"
        >
          {props.years.map((year) => (
            <option key={`from-${year}`} value={year}>
              {year}
            </option>
          ))}
        </select>

        <select
          name="yearTo"
          value={selectedYearTo}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedYearTo(value);
            applyState({ yearTo: value });
          }}
          className="h-14 rounded-2xl border-0 bg-white px-5 text-[15px] font-medium text-slate-800 outline-none"
        >
          {props.years.map((year) => (
            <option key={`to-${year}`} value={year}>
              {year}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-2 rounded-2xl bg-[#3d84c7] px-4 py-3 text-white">
          <span className="text-sm font-semibold">Дополнительные фильтры:</span>
          {filtersForSelectedForm.length === 0 ? (
            <span className="text-sm text-blue-100">Для выбранной формы фильтры не настроены.</span>
          ) : (
            filtersForSelectedForm.map((filter) => (
              <label key={filter.id} className="inline-flex items-center gap-2 text-sm">
                <span>{filter.label}</span>
                <select
                  name="filterOptionIds"
                  value={selectedFilterMap[filter.id] ?? ""}
                  onChange={(event) => {
                    const nextFilterMap = {
                      ...selectedFilterMap,
                      [filter.id]: event.target.value,
                    };
                    setSelectedFilterMap(nextFilterMap);
                    applyState({ filterMap: nextFilterMap });
                  }}
                  className="rounded-xl border-0 bg-white px-3 py-2 text-slate-900 outline-none"
                >
                  {filter.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))
          )}
        </div>
      </div>
    </form>
  );
}

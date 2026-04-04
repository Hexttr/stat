import Link from "next/link";

import {
  createDashboardFilterDefinitionAction,
  createDashboardFilterOptionAction,
  createDashboardMetricAction,
  installDashboardMetricPresetsAction,
  rebuildDashboardStatsAction,
  saveDashboardMetricFiltersAction,
  updateDashboardMetricAction,
} from "@/app/admin/actions";
import { DashboardFiltersForm } from "@/app/admin/dashboard-filters-form";
import { DashboardMetricTrend, RoleType } from "@/generated/prisma/client";
import { hasRole, requireAdminUser } from "@/lib/access";
import { getStatsDashboardAdminConfig, getStatsDashboardSnapshot } from "@/lib/stats-dashboard";

type SearchParams = Record<string, string | string[] | undefined>;

function getTileClasses(tone: "good" | "normal" | "bad" | "blank") {
  switch (tone) {
    case "good":
      return "border-[#89b39d] bg-[#5d8f74] text-white";
    case "normal":
      return "border-[#d69b59] bg-[#dc9a4c] text-slate-950";
    case "bad":
      return "border-[#8e4154] bg-[#7a283d] text-white";
    case "blank":
    default:
      return "border-slate-300 bg-white text-slate-500";
  }
}

function getStringParam(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

function getStringArrayParam(params: SearchParams, key: string) {
  const value = params[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

function formatTrendDirection(value: DashboardMetricTrend) {
  switch (value) {
    case DashboardMetricTrend.HIGHER_IS_BETTER:
      return "Больше - лучше";
    case DashboardMetricTrend.LOWER_IS_BETTER:
      return "Меньше - лучше";
    case DashboardMetricTrend.NEUTRAL:
    default:
      return "Нейтрально";
  }
}

function renderStatusBanner(params: SearchParams) {
  const rebuilt = getStringParam(params, "statsRebuilt");
  if (rebuilt) {
    const [metricsProcessed, valuesWritten] = rebuilt.split("|");
    return (
      <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Статистика пересобрана. Метрик: {metricsProcessed}, агрегированных строк: {valuesWritten}.
      </p>
    );
  }

  const createdMetric = getStringParam(params, "statsMetricCreated");
  if (createdMetric) {
    return (
      <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Метрика `{createdMetric}` добавлена.
      </p>
    );
  }

  const updatedMetric = getStringParam(params, "statsMetricUpdated");
  if (updatedMetric) {
    return (
      <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Метрика `{updatedMetric}` обновлена.
      </p>
    );
  }

  const createdFilter = getStringParam(params, "statsFilterCreated");
  if (createdFilter) {
    return (
      <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Фильтр `{createdFilter}` добавлен.
      </p>
    );
  }

  const createdOption = getStringParam(params, "statsFilterOptionCreated");
  if (createdOption) {
    return (
      <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Опция `{createdOption}` добавлена.
      </p>
    );
  }

  const savedMetricFilters = getStringParam(params, "statsMetricFiltersSaved");
  if (savedMetricFilters) {
    return (
      <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Связи фильтров для метрики `{savedMetricFilters}` сохранены.
      </p>
    );
  }

  const installedPresets = getStringParam(params, "statsPresetsInstalled");
  if (installedPresets) {
    const [metricsInstalled, valuesWritten] = installedPresets.split("|");
    return (
      <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Базовые метрики установлены. Метрик: {metricsInstalled}, агрегированных строк после
        пересборки: {valuesWritten}.
      </p>
    );
  }

  const error = getStringParam(params, "error");
  if (error) {
    return <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  }

  return null;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const user = await requireAdminUser();
  const params = (await searchParams) ?? {};
  const isSuperadmin = hasRole(user, [RoleType.SUPERADMIN]);
  const isSettingsView = getStringParam(params, "view") === "settings";
  const snapshot = await getStatsDashboardSnapshot({
    user,
    filters: {
      regionId: getStringParam(params, "regionId"),
      formTypeId: getStringParam(params, "formTypeId"),
      metricId: getStringParam(params, "metricId"),
      yearFrom: getStringParam(params, "yearFrom")
        ? Number(getStringParam(params, "yearFrom"))
        : null,
      yearTo: getStringParam(params, "yearTo") ? Number(getStringParam(params, "yearTo")) : null,
      filterOptionIds: getStringArrayParam(params, "filterOptionIds"),
    },
  });
  const adminConfig = isSuperadmin && isSettingsView ? await getStatsDashboardAdminConfig() : null;

  const { context, selectedForm, selectedMetric, selectedRegionId } = snapshot;
  const banner = renderStatusBanner(params);

  return (
    <div className="space-y-8">
      {banner}

      <section className="rounded-[2rem] bg-[#1f67ab] p-3 shadow-[0_18px_40px_rgba(31,103,171,0.18)]">
        <DashboardFiltersForm
          canSelectAnyRegion={context.canSelectAnyRegion}
          regions={context.regions}
          forms={context.forms}
          metrics={context.metrics.map((metric) => ({
            id: metric.id,
            name: metric.name,
            formTypeId: metric.formTypeId,
          }))}
          filtersByFormTypeId={context.filtersByFormTypeId}
          years={context.years}
          selectedRegionId={selectedRegionId}
          selectedFormId={selectedForm?.id ?? ""}
          selectedMetricId={selectedMetric?.id ?? ""}
          selectedYearFrom={snapshot.selectedYearFrom}
          selectedYearTo={snapshot.selectedYearTo}
          selectedFilterOptionIds={snapshot.selectedFilterOptionIds}
          view={isSettingsView ? "settings" : null}
        />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
              {selectedRegionId === "RUSSIAN_FEDERATION"
                ? "Российская Федерация"
                : snapshot.context.regions.find((region) => region.id === selectedRegionId)?.shortName ??
                  "Статистика"}
            </h1>
            <p className="mt-2 max-w-4xl text-slate-600">
              {selectedForm ? `${selectedForm.code} - ${selectedForm.name}` : "Форма не выбрана"}.
              {" "}
              {selectedMetric ? `${selectedMetric.name}` : "Метрика не выбрана"}.
              {" "}
              Период: {snapshot.selectedYearFrom}
              {snapshot.selectedYearFrom !== snapshot.selectedYearTo
                ? ` - ${snapshot.selectedYearTo}`
                : ""}.
            </p>
            {selectedMetric ? (
              <p className="mt-2 text-sm text-slate-500">
                Направление оценки: {formatTrendDirection(selectedMetric.trendDirection)}
                {selectedMetric.unit ? `. Единица: ${selectedMetric.unit}.` : "."}
              </p>
            ) : null}
            {snapshot.selectedFilterLabels.length > 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Активные дополнительные фильтры: {snapshot.selectedFilterLabels.join(", ")}.
              </p>
            ) : null}
            {selectedMetric ? (
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-[#5d8f74] px-3 py-1 font-medium text-white">
                  Зеленый: хорошее значение
                </span>
                <span className="rounded-full bg-[#dc9a4c] px-3 py-1 font-medium text-slate-950">
                  Оранжевый: промежуточная зона
                </span>
                <span className="rounded-full bg-[#7a283d] px-3 py-1 font-medium text-white">
                  Бордовый: зона внимания
                </span>
                {selectedMetric.normalThreshold !== null && selectedMetric.goodThreshold !== null ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                    Пороги: оранжевый от {selectedMetric.normalThreshold}, зеленый от{" "}
                    {selectedMetric.goodThreshold}
                    {selectedMetric.trendDirection === DashboardMetricTrend.LOWER_IS_BETTER
                      ? " (для метрик, где меньше - лучше, логика обратная)"
                      : ""}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                    Для этой метрики пороги еще не заданы, поэтому значения отображаются в
                    оранжевой зоне.
                  </span>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col items-start gap-3">
            {isSuperadmin ? (
              <Link
                href={isSettingsView ? "/admin" : "/admin?view=settings"}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {isSettingsView ? "Вернуться к дашборду" : "Настройки статистики"}
              </Link>
            ) : null}

            {selectedRegionId === "RUSSIAN_FEDERATION" && snapshot.totalValue !== null ? (
              <div className="rounded-3xl bg-slate-50 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Сумма по РФ
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {new Intl.NumberFormat("ru-RU", {
                    maximumFractionDigits: snapshot.totalValue % 1 === 0 ? 0 : 2,
                  }).format(snapshot.totalValue)}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 overflow-x-auto pb-2">
          <div
            className="grid min-w-[1180px] gap-1.5"
            style={{
              gridTemplateColumns: "repeat(18, minmax(0, 58px))",
              gridAutoRows: "58px",
            }}
          >
            {snapshot.regionTiles.map((tile) => (
              <div
                key={`${tile.regionCode}-${tile.col}-${tile.row}`}
                className={`flex flex-col items-center justify-center rounded-[6px] border text-center shadow-sm ${getTileClasses(tile.tone)}`}
                title={tile.regionFullName}
                style={{
                  gridColumnStart: tile.col + 1,
                  gridRowStart: tile.row,
                }}
              >
                <span className="text-[11px] font-semibold uppercase leading-none">
                  {tile.displayCode}
                </span>
                <span className="mt-1 text-sm font-semibold leading-none">
                  {tile.value || "нет данных"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {snapshot.regionTiles.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Нет данных для отображения по выбранным параметрам.
          </p>
        ) : null}
      </section>

      {isSuperadmin && adminConfig ? (
        <section className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">Настройка метрик</h2>
                <p className="mt-2 text-slate-600">
                  Подключайте реальные поля формы к главной статистике и задавайте правила
                  раскраски. Зеленый = хорошая зона, оранжевый = промежуточная, бордовый = зона
                  внимания.
                </p>
              </div>

              <form action={rebuildDashboardStatsAction}>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Пересобрать статистику
                  </button>
                </div>
              </form>
            </div>

            <form action={installDashboardMetricPresetsAction} className="mt-4">
              <button
                type="submit"
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                Установить базовые метрики F12/F14/F19/F30/F47
              </button>
            </form>

            <form action={createDashboardMetricAction} className="mt-8 grid gap-4">
              <select
                name="formTypeId"
                defaultValue={selectedForm?.id ?? adminConfig.allForms[0]?.id ?? ""}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
              >
                {adminConfig.allForms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.code} - {form.name}
                  </option>
                ))}
              </select>

              <input
                name="sourceFieldKey"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                placeholder="Ключ поля формы, например beds_total"
              />

              <input
                name="name"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                placeholder="Название метрики"
              />

              <input
                name="unit"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                placeholder="Единица измерения"
              />

              <textarea
                name="description"
                rows={3}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                placeholder="Описание метрики"
              />

              <div className="grid gap-4 md:grid-cols-3">
                <select
                  name="trendDirection"
                  defaultValue={DashboardMetricTrend.NEUTRAL}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                >
                  <option value={DashboardMetricTrend.HIGHER_IS_BETTER}>Больше - лучше</option>
                  <option value={DashboardMetricTrend.LOWER_IS_BETTER}>Меньше - лучше</option>
                  <option value={DashboardMetricTrend.NEUTRAL}>Нейтрально</option>
                </select>

                <input
                  name="normalThreshold"
                  type="number"
                  step="0.01"
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  placeholder="Порог оранжевой зоны"
                />

                <input
                  name="goodThreshold"
                  type="number"
                  step="0.01"
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                  placeholder="Порог зеленой зоны"
                />
              </div>
              <p className="text-sm text-slate-500">
                Если выбрано `Больше - лучше`, то ниже оранжевого порога плитка будет бордовой,
                между порогами - оранжевой, выше зеленого порога - зеленой. Для режима
                `Меньше - лучше` логика обратная.
              </p>

              <button className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700">
                Добавить метрику
              </button>
            </form>

            <div className="mt-8 space-y-4">
              {adminConfig.metrics.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Метрики для дашборда пока не настроены.
                </p>
              ) : (
                adminConfig.metrics.map((metric) => {
                  const formFilters = adminConfig.filtersByFormTypeId[metric.formTypeId] ?? [];
                  const selectedOptions = new Set(metric.filterOptionIds);

                  return (
                    <div key={metric.id} className="rounded-3xl border border-slate-200 p-4">
                      <form action={updateDashboardMetricAction} className="grid gap-3">
                        <input type="hidden" name="metricId" value={metric.id} />

                        <div className="grid gap-3 md:grid-cols-2">
                          <select
                            name="formTypeId"
                            defaultValue={metric.formTypeId}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                          >
                            {adminConfig.allForms.map((form) => (
                              <option key={`${metric.id}-${form.id}`} value={form.id}>
                                {form.code} - {form.name}
                              </option>
                            ))}
                          </select>

                          <input
                            name="sourceFieldKey"
                            defaultValue={metric.sourceFieldKey}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                          />
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <input
                            name="name"
                            defaultValue={metric.name}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                          />

                          <input
                            name="unit"
                            defaultValue={metric.unit ?? ""}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                          />
                        </div>

                        <textarea
                          name="description"
                          rows={2}
                          defaultValue={metric.description ?? ""}
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                        />

                        <div className="grid gap-3 md:grid-cols-4">
                          <select
                            name="trendDirection"
                            defaultValue={metric.trendDirection}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                          >
                            <option value={DashboardMetricTrend.HIGHER_IS_BETTER}>Больше - лучше</option>
                            <option value={DashboardMetricTrend.LOWER_IS_BETTER}>Меньше - лучше</option>
                            <option value={DashboardMetricTrend.NEUTRAL}>Нейтрально</option>
                          </select>

                          <input
                            name="normalThreshold"
                            type="number"
                            step="0.01"
                            defaultValue={metric.normalThreshold ?? ""}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                            placeholder="Порог оранжевой зоны"
                          />

                          <input
                            name="goodThreshold"
                            type="number"
                            step="0.01"
                            defaultValue={metric.goodThreshold ?? ""}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                            placeholder="Порог зеленой зоны"
                          />

                          <label className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                            <input
                              type="checkbox"
                              name="isDashboardEnabled"
                              defaultChecked={metric.isDashboardEnabled}
                              className="size-4"
                            />
                            Активна на дашборде
                          </label>
                        </div>
                        <p className="text-sm text-slate-500">
                          Зеленый = хорошая зона, оранжевый = промежуточная, бордовый = зона
                          внимания. Для `Меньше - лучше` пороги интерпретируются в обратную
                          сторону.
                        </p>

                        <button className="w-fit rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                          Сохранить метрику
                        </button>
                      </form>

                      <form action={saveDashboardMetricFiltersAction} className="mt-4 space-y-3">
                        <input type="hidden" name="metricId" value={metric.id} />
                        <p className="text-sm font-medium text-slate-700">
                          Доступность по дополнительным фильтрам
                        </p>
                        {formFilters.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            Для формы пока не добавлены дополнительные фильтры.
                          </p>
                        ) : (
                          formFilters.map((filter) => (
                            <div key={`${metric.id}-${filter.id}`} className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-sm font-medium text-slate-700">{filter.label}</p>
                              <div className="mt-2 flex flex-wrap gap-3">
                                {filter.options.map((option) => (
                                  <label
                                    key={`${metric.id}-${option.id}`}
                                    className="inline-flex items-center gap-2 text-sm text-slate-600"
                                  >
                                    <input
                                      type="checkbox"
                                      name="filterOptionIds"
                                      value={option.id}
                                      defaultChecked={selectedOptions.has(option.id)}
                                      className="size-4"
                                    />
                                    {option.label}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))
                        )}

                        {formFilters.length > 0 ? (
                          <button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                            Сохранить связи фильтров
                          </button>
                        ) : null}
                      </form>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-950">Дополнительные фильтры формы</h2>
            <p className="mt-2 text-slate-600">
              Здесь можно завести возраст, пол и другие переключатели, которые появляются на
              главной странице только для нужной формы.
            </p>

            <form action={createDashboardFilterDefinitionAction} className="mt-8 grid gap-4">
              <select
                name="formTypeId"
                defaultValue={selectedForm?.id ?? adminConfig.allForms[0]?.id ?? ""}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
              >
                {adminConfig.allForms.map((form) => (
                  <option key={`filter-form-${form.id}`} value={form.id}>
                    {form.code} - {form.name}
                  </option>
                ))}
              </select>

              <input
                name="code"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                placeholder="Код фильтра, например age"
              />

              <input
                name="label"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                placeholder="Подпись фильтра, например Выбор возраста"
              />

              <button className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700">
                Добавить фильтр
              </button>
            </form>

            <div className="mt-8 space-y-4">
              {Object.entries(adminConfig.filtersByFormTypeId).length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Дополнительные фильтры пока не настроены.
                </p>
              ) : (
                Object.entries(adminConfig.filtersByFormTypeId).map(([formTypeId, filters]) => {
                  const form = adminConfig.allForms.find((entry) => entry.id === formTypeId);

                  return (
                    <div key={formTypeId} className="rounded-3xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {form ? `${form.code} - ${form.name}` : "Форма"}
                      </p>

                      <div className="mt-3 space-y-4">
                        {filters.map((filter) => (
                          <div key={filter.id} className="rounded-2xl bg-slate-50 p-4">
                            <p className="font-medium text-slate-900">{filter.label}</p>
                            <p className="mt-1 text-sm text-slate-500">Код: {filter.code}</p>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {filter.options.length === 0 ? (
                                <span className="text-sm text-slate-500">Опций пока нет.</span>
                              ) : (
                                filter.options.map((option) => (
                                  <span
                                    key={option.id}
                                    className="rounded-full bg-white px-3 py-1 text-sm text-slate-700"
                                  >
                                    {option.label}
                                    {option.isDefault ? " (по умолчанию)" : ""}
                                  </span>
                                ))
                              )}
                            </div>

                            <form action={createDashboardFilterOptionAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
                              <input type="hidden" name="filterDefinitionId" value={filter.id} />
                              <input
                                name="value"
                                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                                placeholder="Значение, например age_0_17"
                              />
                              <input
                                name="label"
                                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
                                placeholder="Подпись, например 0-17 лет"
                              />
                              <label className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
                                <input type="checkbox" name="isDefault" className="size-4" />
                                По умолчанию
                              </label>
                              <button className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                                Добавить опцию
                              </button>
                            </form>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </section>
      ) : null}
    </div>
  );
}

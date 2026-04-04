import { unstable_cache } from "next/cache";

import { DashboardMetricTrend, RoleType, SubmissionStatus } from "@/generated/prisma/client";
import type { AdminUser } from "@/lib/access";
import { hasRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export const STATS_DASHBOARD_CACHE_TAG = "stats-dashboard";

export type StatsDashboardFilters = {
  regionId?: string | null;
  formTypeId?: string | null;
  metricId?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  filterOptionIds?: string[];
};

export type RegionGridTone = "good" | "normal" | "bad" | "blank";

export type RegionGridTile = {
  regionId: string;
  regionCode: string;
  regionShortName: string;
  regionFullName: string;
  displayCode: string;
  value: string;
  numericValue: number | null;
  tone: RegionGridTone;
  col: number;
  row: number;
};

type GridCell = {
  regionCode: string;
  displayCode: string;
  col: number;
  row: number;
};

const regionGridLayout: GridCell[] = [
  { regionCode: "MURMANSK", displayCode: "МУРМ", col: 4, row: 1 },
  { regionCode: "SAINT_PETERSBURG", displayCode: "СПБ", col: 2, row: 2 },
  { regionCode: "KARELIA", displayCode: "КАРЕЛ", col: 3, row: 2 },
  { regionCode: "KALININGRAD", displayCode: "КАЛИН", col: 0, row: 3 },
  { regionCode: "LENINGRAD", displayCode: "ЛЕНИН", col: 2, row: 3 },
  { regionCode: "NOVGOROD", displayCode: "НОВГ", col: 3, row: 3 },
  { regionCode: "VOLOGDA", displayCode: "ВОЛОГ", col: 4, row: 3 },
  { regionCode: "NENETS_AO", displayCode: "НЕНЦ", col: 8, row: 2 },
  { regionCode: "ARKHANGELSK", displayCode: "АРХАН", col: 7, row: 3 },
  { regionCode: "KOMI", displayCode: "КОМИ", col: 8, row: 3 },
  { regionCode: "YAMALO_NENETS_AO", displayCode: "ЯНАО", col: 9, row: 3 },
  { regionCode: "KRASNOYARSK", displayCode: "КРАСН", col: 12, row: 3 },
  { regionCode: "CHUKOTKA_AO", displayCode: "ЧУКОТ", col: 15, row: 2 },
  { regionCode: "SAKHA", displayCode: "ЯКУТИЯ", col: 14, row: 3 },
  { regionCode: "MAGADAN", displayCode: "МАГАД", col: 15, row: 3 },
  { regionCode: "KAMCHATKA", displayCode: "КАМЧ", col: 16, row: 3 },
  { regionCode: "PSKOV", displayCode: "ПСКОВ", col: 2, row: 4 },
  { regionCode: "TVER", displayCode: "ТВЕРЬ", col: 3, row: 4 },
  { regionCode: "YAROSLAVL", displayCode: "ЯРОСЛ", col: 4, row: 4 },
  { regionCode: "IVANOVO", displayCode: "ИВАН", col: 5, row: 4 },
  { regionCode: "KOSTROMA", displayCode: "КОСТР", col: 6, row: 4 },
  { regionCode: "MARI_EL", displayCode: "МАРИ", col: 7, row: 4 },
  { regionCode: "KIROV", displayCode: "КИРОВ", col: 8, row: 4 },
  { regionCode: "PERM", displayCode: "ПЕРМ", col: 9, row: 4 },
  { regionCode: "KHANTY_MANSI_AO", displayCode: "ХМАО", col: 10, row: 4 },
  { regionCode: "TYUMEN", displayCode: "ТЮМЕН", col: 11, row: 4 },
  { regionCode: "TOMSK", displayCode: "ТОМСК", col: 12, row: 4 },
  { regionCode: "KEMEROVO", displayCode: "КЕМЕР", col: 13, row: 4 },
  { regionCode: "IRKUTSK", displayCode: "ИРКУТ", col: 14, row: 4 },
  { regionCode: "AMUR", displayCode: "АМУР", col: 15, row: 4 },
  { regionCode: "KHABAROVSK", displayCode: "ХАБАР", col: 16, row: 4 },
  { regionCode: "SMOLENSK", displayCode: "СМОЛ", col: 1, row: 5 },
  { regionCode: "KALUGA", displayCode: "КАЛУЖ", col: 2, row: 5 },
  { regionCode: "MOSCOW_OBLAST", displayCode: "МОСКОВ", col: 3, row: 5 },
  { regionCode: "MOSCOW", displayCode: "МСК", col: 4, row: 5 },
  { regionCode: "VLADIMIR", displayCode: "ВЛАД", col: 5, row: 5 },
  { regionCode: "NIZHNY_NOVGOROD", displayCode: "НИЖЕГ", col: 6, row: 5 },
  { regionCode: "OKTMO_97000000000", displayCode: "ЧУВАШ", col: 7, row: 5 },
  { regionCode: "TATARSTAN", displayCode: "ТАТАР", col: 8, row: 5 },
  { regionCode: "UDMURTIA", displayCode: "УДМУР", col: 9, row: 5 },
  { regionCode: "SVERDLOVSK", displayCode: "СВЕРДЛ", col: 10, row: 5 },
  { regionCode: "KURGAN", displayCode: "КУРГАН", col: 11, row: 5 },
  { regionCode: "NOVOSIBIRSK", displayCode: "НОВОС", col: 12, row: 5 },
  { regionCode: "KHAKASSIA", displayCode: "ХАКАС", col: 13, row: 5 },
  { regionCode: "BURYATIA", displayCode: "БУРЯТ", col: 14, row: 5 },
  { regionCode: "JEWISH_AO", displayCode: "ЕВР", col: 15, row: 5 },
  { regionCode: "PRIMORSKY", displayCode: "ПРИМОР", col: 16, row: 5 },
  { regionCode: "BRYANSK", displayCode: "БРЯНС", col: 2, row: 6 },
  { regionCode: "ORYOL", displayCode: "ОРЛОВ", col: 3, row: 6 },
  { regionCode: "TULA", displayCode: "ТУЛЬС", col: 4, row: 6 },
  { regionCode: "RYAZAN", displayCode: "РЯЗАН", col: 5, row: 6 },
  { regionCode: "MORDOVIA", displayCode: "МОРД", col: 6, row: 6 },
  { regionCode: "ULYANOVSK", displayCode: "УЛЬЯН", col: 7, row: 6 },
  { regionCode: "SAMARA", displayCode: "САМАР", col: 8, row: 6 },
  { regionCode: "BASHKORTOSTAN", displayCode: "БАШК", col: 9, row: 6 },
  { regionCode: "CHELYABINSK", displayCode: "ЧЕЛЯБ", col: 10, row: 6 },
  { regionCode: "OMSK", displayCode: "ОМСК", col: 11, row: 6 },
  { regionCode: "ALTAI_KRAI", displayCode: "АЛТ.К", col: 12, row: 6 },
  { regionCode: "TUVA", displayCode: "ТЫВА", col: 13, row: 6 },
  { regionCode: "ZABAIKALSKY", displayCode: "ЗАБАЙК", col: 14, row: 6 },
  { regionCode: "LUGANSK", displayCode: "ЛНР", col: 2, row: 7 },
  { regionCode: "KURSK", displayCode: "КУРСК", col: 3, row: 7 },
  { regionCode: "LIPETSK", displayCode: "ЛИПЕЦ", col: 4, row: 7 },
  { regionCode: "TAMBOV", displayCode: "ТАМБОВ", col: 5, row: 7 },
  { regionCode: "PENZA", displayCode: "ПЕНЗ", col: 6, row: 7 },
  { regionCode: "SARATOV", displayCode: "САРАТОВ", col: 7, row: 7 },
  { regionCode: "ORENBURG", displayCode: "ОРЕНБ", col: 8, row: 7 },
  { regionCode: "ALTAI_REP", displayCode: "АЛТАЙ", col: 12, row: 7 },
  { regionCode: "KHERSON", displayCode: "ХЕРС", col: 1, row: 8 },
  { regionCode: "ZAPORIZHZHIA", displayCode: "ЗАПР", col: 2, row: 8 },
  { regionCode: "DONETSK", displayCode: "ДНР", col: 3, row: 8 },
  { regionCode: "BELGOROD", displayCode: "БЕЛГОР", col: 4, row: 8 },
  { regionCode: "VORONEZH", displayCode: "ВОРОН", col: 5, row: 8 },
  { regionCode: "VOLGOGRAD", displayCode: "ВОЛГО", col: 6, row: 8 },
  { regionCode: "CRIMEA", displayCode: "КРЫМ", col: 2, row: 9 },
  { regionCode: "ADYGEA", displayCode: "АДЫГ", col: 3, row: 9 },
  { regionCode: "KRASNODAR", displayCode: "КР.КР", col: 4, row: 9 },
  { regionCode: "ROSTOV", displayCode: "РОСТОВ", col: 5, row: 9 },
  { regionCode: "KALMYKIA", displayCode: "КАЛМ", col: 6, row: 9 },
  { regionCode: "ASTRAKHAN", displayCode: "АСТРАХ", col: 7, row: 9 },
  { regionCode: "SEVASTOPOL", displayCode: "СЕВАСТ", col: 2, row: 10 },
  { regionCode: "KARACHAY_CHERKESSIA", displayCode: "КЧР", col: 4, row: 10 },
  { regionCode: "STAVROPOL", displayCode: "СТАВР", col: 5, row: 10 },
  { regionCode: "CHECHNYA", displayCode: "ЧЕЧНЯ", col: 6, row: 10 },
  { regionCode: "DAGESTAN", displayCode: "ДАГЕС", col: 7, row: 10 },
  { regionCode: "KABARDINO_BALKARIA", displayCode: "КБР", col: 4, row: 11 },
  { regionCode: "OKTMO_90000000000", displayCode: "АЛАНИЯ", col: 5, row: 11 },
  { regionCode: "INGUSHETIA", displayCode: "ИНГУШ", col: 6, row: 11 },
  { regionCode: "SAKHALIN", displayCode: "САХАЛН", col: 17, row: 7 },
];

const regionGridLayoutByCode = new Map(regionGridLayout.map((item) => [item.regionCode, item]));

function formatMetricValue(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "";
  }

  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function resolveGridTone(params: {
  value: number | null;
  trendDirection: DashboardMetricTrend;
  normalThreshold: number | null;
  goodThreshold: number | null;
}): RegionGridTone {
  if (params.value === null) {
    return "blank";
  }

  if (
    params.trendDirection === DashboardMetricTrend.NEUTRAL ||
    params.normalThreshold === null ||
    params.goodThreshold === null
  ) {
    return "normal";
  }

  if (params.trendDirection === DashboardMetricTrend.HIGHER_IS_BETTER) {
    if (params.value >= params.goodThreshold) {
      return "good";
    }
    if (params.value >= params.normalThreshold) {
      return "normal";
    }
    return "bad";
  }

  if (params.value <= params.goodThreshold) {
    return "good";
  }
  if (params.value <= params.normalThreshold) {
    return "normal";
  }
  return "bad";
}

type DashboardMetricRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string | null;
  formTypeId: string;
  sourceFieldKey: string;
  sortOrder: number;
  isDashboardEnabled: boolean;
  trendDirection: DashboardMetricTrend;
  goodThreshold: number | null;
  normalThreshold: number | null;
  filterOptionIds: string[];
};

type DashboardFilterRecord = {
  id: string;
  code: string;
  label: string;
  options: Array<{
    id: string;
    value: string;
    label: string;
    isDefault: boolean;
  }>;
};

type DashboardViewerContext = {
  forms: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  metrics: DashboardMetricRecord[];
  reportingYears: Array<{
    id: string;
    year: number;
  }>;
  years: number[];
  filtersByFormTypeId: Record<string, DashboardFilterRecord[]>;
  regions: Array<{
    id: string;
    code: string;
    shortName: string;
    fullName: string;
  }>;
};

type DashboardAdminConfig = {
  allForms: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  metrics: DashboardMetricRecord[];
  filtersByFormTypeId: Record<string, DashboardFilterRecord[]>;
};

function mapDashboardMetrics(
  metricsRaw: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    unit: string | null;
    formTypeId: string;
    sourceFieldKey: string;
    sortOrder: number;
    isDashboardEnabled: boolean;
    trendDirection: DashboardMetricTrend;
    goodThreshold: unknown;
    normalThreshold: unknown;
    dashboardFilterOptions: Array<{
      filterOptionId: string;
    }>;
  }>,
) {
  return metricsRaw.map<DashboardMetricRecord>((metric) => ({
    id: metric.id,
    code: metric.code,
    name: metric.name,
    description: metric.description,
    unit: metric.unit,
    formTypeId: metric.formTypeId,
    sourceFieldKey: metric.sourceFieldKey,
    sortOrder: metric.sortOrder,
    isDashboardEnabled: metric.isDashboardEnabled,
    trendDirection: metric.trendDirection,
    goodThreshold: metric.goodThreshold ? Number(metric.goodThreshold) : null,
    normalThreshold: metric.normalThreshold ? Number(metric.normalThreshold) : null,
    filterOptionIds: metric.dashboardFilterOptions.map((option) => option.filterOptionId),
  }));
}

function groupFiltersByFormTypeId(
  filtersRaw: Array<{
    id: string;
    code: string;
    label: string;
    formTypeId: string;
    options: DashboardFilterRecord["options"];
  }>,
) {
  return filtersRaw.reduce<Record<string, DashboardFilterRecord[]>>((accumulator, filter) => {
    if (!accumulator[filter.formTypeId]) {
      accumulator[filter.formTypeId] = [];
    }
    accumulator[filter.formTypeId].push({
      id: filter.id,
      code: filter.code,
      label: filter.label,
      options: filter.options,
    });
    return accumulator;
  }, {});
}

async function loadStatsDashboardViewerContextUncached(): Promise<DashboardViewerContext> {
  const [forms, metricsRaw, reportingYears, filtersRaw, regions] = await Promise.all([
    prisma.formType.findMany({
      where: {
        dashboardMetrics: {
          some: {
            isDashboardEnabled: true,
          },
        },
      },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
      },
    }),
    prisma.metricDefinition.findMany({
      where: {
        isDashboardEnabled: true,
      },
      orderBy: [{ formType: { code: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        unit: true,
        formTypeId: true,
        sourceFieldKey: true,
        sortOrder: true,
        isDashboardEnabled: true,
        trendDirection: true,
        goodThreshold: true,
        normalThreshold: true,
        dashboardFilterOptions: {
          select: {
            filterOptionId: true,
          },
        },
      },
    }),
    prisma.reportingYear.findMany({
      orderBy: [{ year: "desc" }],
      select: {
        id: true,
        year: true,
      },
    }),
    prisma.dashboardFilterDefinition.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ formType: { code: "asc" } }, { sortOrder: "asc" }],
      select: {
        id: true,
        code: true,
        label: true,
        formTypeId: true,
        options: {
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          select: {
            id: true,
            value: true,
            label: true,
            isDefault: true,
          },
        },
      },
    }),
    prisma.region.findMany({
      where: {
        subjectOktmoKey: {
          not: null,
        },
      },
      orderBy: [{ fullName: "asc" }],
      select: {
        id: true,
        code: true,
        shortName: true,
        fullName: true,
      },
    }),
  ]);

  return {
    forms,
    metrics: mapDashboardMetrics(metricsRaw),
    reportingYears,
    years: reportingYears.map((year) => year.year),
    filtersByFormTypeId: groupFiltersByFormTypeId(filtersRaw),
    regions,
  };
}

async function loadStatsDashboardAdminConfigUncached(): Promise<DashboardAdminConfig> {
  const [allForms, metricsRaw, filtersRaw] = await Promise.all([
      prisma.formType.findMany({
        orderBy: [{ code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
        },
      }),
      prisma.metricDefinition.findMany({
        orderBy: [{ formType: { code: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          unit: true,
          formTypeId: true,
          sourceFieldKey: true,
          sortOrder: true,
          isDashboardEnabled: true,
          trendDirection: true,
          goodThreshold: true,
          normalThreshold: true,
          dashboardFilterOptions: {
            select: {
              filterOptionId: true,
            },
          },
        },
      }),
      prisma.dashboardFilterDefinition.findMany({
        where: {
          isActive: true,
        },
        orderBy: [{ formType: { code: "asc" } }, { sortOrder: "asc" }],
        select: {
          id: true,
          code: true,
          label: true,
          formTypeId: true,
          options: {
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
            select: {
              id: true,
              value: true,
              label: true,
              isDefault: true,
            },
          },
        },
      }),
    ]);

  return {
    allForms,
    metrics: mapDashboardMetrics(metricsRaw),
    filtersByFormTypeId: groupFiltersByFormTypeId(filtersRaw),
  };
}

const loadStatsDashboardAdminConfig = unstable_cache(
  async (): Promise<DashboardAdminConfig> => loadStatsDashboardAdminConfigUncached(),
  ["stats-dashboard-admin-config-v2"],
  {
    tags: [STATS_DASHBOARD_CACHE_TAG],
  },
);

export async function getStatsDashboardAdminConfig(options?: {
  uncached?: boolean;
}) {
  return options?.uncached
    ? loadStatsDashboardAdminConfigUncached()
    : loadStatsDashboardAdminConfig();
}

const loadStatsDashboardContext = unstable_cache(
  async (): Promise<DashboardViewerContext> => loadStatsDashboardViewerContextUncached(),
  ["stats-dashboard-context-v2"],
  {
    tags: [STATS_DASHBOARD_CACHE_TAG],
  },
);

export async function getStatsDashboardContext(
  user: AdminUser,
  options?: {
    uncached?: boolean;
  },
) {
  const scopeRegionIds = hasRole(user, [RoleType.SUPERADMIN])
    ? null
    : [
        ...new Set(
          user.memberships
            .filter((membership) => membership.role === RoleType.REGION_ADMIN)
            .map((membership) => membership.organization.regionId)
            .filter((regionId): regionId is string => Boolean(regionId)),
        ),
      ];

  const context = options?.uncached
    ? await loadStatsDashboardViewerContextUncached()
    : await loadStatsDashboardContext();
  const regions =
    scopeRegionIds === null
      ? context.regions
      : context.regions.filter((region) => scopeRegionIds.includes(region.id));

  return {
    ...context,
    regions,
    canSelectAnyRegion: scopeRegionIds === null,
    defaultRegionId:
      scopeRegionIds === null ? "RUSSIAN_FEDERATION" : (regions[0]?.id ?? "RUSSIAN_FEDERATION"),
  };
}

export async function getStatsDashboardSnapshot(params: {
  user: AdminUser;
  filters: StatsDashboardFilters;
  uncached?: boolean;
}) {
  const context = await getStatsDashboardContext(params.user, {
    uncached: params.uncached,
  });
  const years = context.years;
  const selectedForm =
    context.forms.find((form) => form.id === params.filters.formTypeId) ?? context.forms[0] ?? null;
  const selectedFormFilters = selectedForm ? context.filtersByFormTypeId[selectedForm.id] ?? [] : [];
  const selectedFilterOptionIds = new Set(
    (params.filters.filterOptionIds && params.filters.filterOptionIds.length > 0
      ? params.filters.filterOptionIds
      : selectedFormFilters
          .map((filter) => filter.options.find((option) => option.isDefault)?.id ?? null)
          .filter((optionId): optionId is string => Boolean(optionId))) ?? [],
  );
  const metrics = selectedForm
    ? context.metrics.filter(
        (metric) => metric.formTypeId === selectedForm.id && metric.isDashboardEnabled,
      )
    : [];
  const metricsAfterDynamicFilters = metrics.filter((metric) => {
    if (selectedFilterOptionIds.size === 0) {
      return true;
    }
    const allowedOptionIds = new Set(metric.filterOptionIds);
    return Array.from(selectedFilterOptionIds).every((optionId) => allowedOptionIds.has(optionId));
  });

  const selectedMetric =
    metricsAfterDynamicFilters.find((metric) => metric.id === params.filters.metricId) ??
    metricsAfterDynamicFilters[0] ??
    null;
  const metricLatestYear =
    selectedMetric && params.filters.yearFrom == null && params.filters.yearTo == null
      ? await prisma.aggregatedMetric.findFirst({
          where: {
            metricId: selectedMetric.id,
          },
          orderBy: {
            reportingYear: {
              year: "desc",
            },
          },
          select: {
            reportingYear: {
              select: {
                year: true,
              },
            },
          },
        })
      : null;
  const fallbackYear = metricLatestYear?.reportingYear.year ?? years[0] ?? new Date().getFullYear();
  const yearFrom =
    params.filters.yearFrom && years.includes(params.filters.yearFrom)
      ? params.filters.yearFrom
      : fallbackYear;
  const yearTo =
    params.filters.yearTo && years.includes(params.filters.yearTo)
      ? params.filters.yearTo
      : yearFrom;
  const normalizedYearFrom = Math.min(yearFrom, yearTo);
  const normalizedYearTo = Math.max(yearFrom, yearTo);

  const allowedRegionIds = new Set(context.regions.map((region) => region.id));
  const selectedRegionId =
    params.filters.regionId === "RUSSIAN_FEDERATION"
      ? "RUSSIAN_FEDERATION"
      : params.filters.regionId && allowedRegionIds.has(params.filters.regionId)
        ? params.filters.regionId
        : context.canSelectAnyRegion
          ? "RUSSIAN_FEDERATION"
          : (context.regions[0]?.id ?? "RUSSIAN_FEDERATION");

  let valueByRegionId = new Map<string, { value: number; sourceSubmissionCount: number }>();

  if (selectedMetric) {
    const selectedReportingYearIds = context.reportingYears
      .filter((entry) => entry.year >= normalizedYearFrom && entry.year <= normalizedYearTo)
      .map((entry) => entry.id);

    if (selectedReportingYearIds.length > 0) {
      const yearRows = await prisma.aggregatedMetric.findMany({
        where: {
          metricId: selectedMetric.id,
          reportingYearId: {
            in: selectedReportingYearIds,
          },
          regionId:
            selectedRegionId === "RUSSIAN_FEDERATION"
              ? {
                  in: context.regions.map((region) => region.id),
                }
              : selectedRegionId,
        },
        select: {
          regionId: true,
          value: true,
          sourceSubmissionCount: true,
        },
      });

      valueByRegionId = yearRows.reduce(
        (map, row) => {
          const existing = map.get(row.regionId) ?? { value: 0, sourceSubmissionCount: 0 };
          map.set(row.regionId, {
            value: existing.value + Number(row.value),
            sourceSubmissionCount: existing.sourceSubmissionCount + row.sourceSubmissionCount,
          });
          return map;
        },
        new Map<string, { value: number; sourceSubmissionCount: number }>(),
      );
    }
  }

  const visibleRegions =
    selectedRegionId === "RUSSIAN_FEDERATION"
      ? context.regions
      : context.regions.filter((region) => region.id === selectedRegionId);

  const regionTiles: RegionGridTile[] = visibleRegions
    .map((region) => {
      const layout = regionGridLayoutByCode.get(region.code);
      if (!layout) {
        return null;
      }

      const metricValue = valueByRegionId.get(region.id)?.value ?? null;

      return {
        regionId: region.id,
        regionCode: region.code,
        regionShortName: region.shortName,
        regionFullName: region.fullName,
        displayCode: layout.displayCode,
        value: formatMetricValue(metricValue),
        numericValue: metricValue,
        tone: selectedMetric
          ? resolveGridTone({
              value: metricValue,
              trendDirection: selectedMetric.trendDirection,
              normalThreshold: selectedMetric.normalThreshold,
              goodThreshold: selectedMetric.goodThreshold,
            })
          : "blank",
        col: layout.col,
        row: layout.row,
      };
    })
    .filter((tile): tile is RegionGridTile => Boolean(tile));

  const filterOptionMap = new Map(
    selectedFormFilters.flatMap((filter) => filter.options.map((option) => [option.id, option] as const)),
  );
  const selectedFilterLabels = Array.from(selectedFilterOptionIds)
    .map((optionId) => filterOptionMap.get(optionId)?.label ?? null)
    .filter((label): label is string => Boolean(label));

  const rfTotalValue =
    selectedRegionId === "RUSSIAN_FEDERATION"
      ? Array.from(valueByRegionId.values()).reduce((sum, row) => sum + row.value, 0)
      : null;

  return {
    context,
    selectedForm,
    selectedMetric,
    selectedRegionId,
    selectedYearFrom: normalizedYearFrom,
    selectedYearTo: normalizedYearTo,
    selectedFormFilters,
    selectedFilterOptionIds: Array.from(selectedFilterOptionIds),
    selectedFilterLabels,
    regionTiles,
    totalValue: rfTotalValue,
  };
}

export async function rebuildAggregatedMetricsForDashboard() {
  const dashboardMetrics = await prisma.metricDefinition.findMany({
    where: {
      isDashboardEnabled: true,
    },
    select: {
      id: true,
      sourceFieldKey: true,
      formTypeId: true,
    },
  });

  if (dashboardMetrics.length === 0) {
    return { metricsProcessed: 0, valuesWritten: 0 };
  }

  const fieldRows = await prisma.formField.findMany({
    where: {
      OR: dashboardMetrics.map((metric) => ({
        key: metric.sourceFieldKey,
        templateVersion: {
          template: {
            formTypeId: metric.formTypeId,
          },
        },
      })),
    },
    select: {
      id: true,
      key: true,
      templateVersion: {
        select: {
          reportingYearId: true,
          template: {
            select: {
              formTypeId: true,
            },
          },
        },
      },
    },
  });

  const metricFieldPairs = dashboardMetrics.flatMap((metric) =>
    fieldRows
      .filter(
        (field) =>
          field.key === metric.sourceFieldKey &&
          field.templateVersion.template.formTypeId === metric.formTypeId,
      )
      .map((field) => ({
        metricId: metric.id,
        fieldId: field.id,
        reportingYearId: field.templateVersion.reportingYearId,
      })),
  );

  if (metricFieldPairs.length === 0) {
    await prisma.aggregatedMetric.deleteMany({
      where: {
        indicatorId: null,
        metric: {
          isDashboardEnabled: true,
        },
      },
    });

    return { metricsProcessed: dashboardMetrics.length, valuesWritten: 0 };
  }

  const fieldIds = metricFieldPairs.map((pair) => pair.fieldId);
  const metricPairByFieldId = new Map(metricFieldPairs.map((pair) => [pair.fieldId, pair]));
  const submissionRows = await prisma.submissionValue.findMany({
    where: {
      fieldId: {
        in: fieldIds,
      },
      submission: {
        status: {
          in: [
            // Archive imports are materialized as regional draft submissions before manual review.
            // Dashboard presets should be able to aggregate those historical values as well.
            SubmissionStatus.DRAFT,
            SubmissionStatus.APPROVED_BY_REGION,
            SubmissionStatus.APPROVED_BY_SUPERADMIN,
            SubmissionStatus.SUBMITTED,
            SubmissionStatus.IN_REVIEW,
          ],
        },
        assignment: {
          region: {
            subjectOktmoKey: {
              not: null,
            },
          },
        },
      },
    },
    select: {
      fieldId: true,
      valueNumber: true,
      valueText: true,
      submission: {
        select: {
          assignment: {
            select: {
              regionId: true,
            },
          },
        },
      },
    },
  });

  const aggregateMap = new Map<
    string,
    {
      metricId: string;
      reportingYearId: string;
      regionId: string;
      value: number;
      sourceSubmissionCount: number;
    }
  >();

  for (const row of submissionRows) {
    const metricPair = metricPairByFieldId.get(row.fieldId);
    if (!metricPair) {
      continue;
    }

    const rawValue = row.valueNumber ? Number(row.valueNumber) : Number(row.valueText ?? "");
    if (!Number.isFinite(rawValue)) {
      continue;
    }

    const aggregateKey = `${metricPair.metricId}|${metricPair.reportingYearId}|${row.submission.assignment.regionId}`;
    const existing = aggregateMap.get(aggregateKey) ?? {
      metricId: metricPair.metricId,
      reportingYearId: metricPair.reportingYearId,
      regionId: row.submission.assignment.regionId,
      value: 0,
      sourceSubmissionCount: 0,
    };
    existing.value += rawValue;
    existing.sourceSubmissionCount += 1;
    aggregateMap.set(aggregateKey, existing);
  }

  await prisma.$transaction(async (tx) => {
    await tx.aggregatedMetric.deleteMany({
      where: {
        indicatorId: null,
        metric: {
          isDashboardEnabled: true,
        },
      },
    });

    if (aggregateMap.size > 0) {
      await tx.aggregatedMetric.createMany({
        data: Array.from(aggregateMap.values()).map((row) => ({
          reportingYearId: row.reportingYearId,
          regionId: row.regionId,
          metricId: row.metricId,
          indicatorId: null,
          value: row.value,
          sourceSubmissionCount: row.sourceSubmissionCount,
        })),
      });
    }
  });

  return {
    metricsProcessed: dashboardMetrics.length,
    valuesWritten: aggregateMap.size,
  };
}

import "dotenv/config";

import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  FormAssignmentStatus,
  FormTemplateVersionStatus,
  OrganizationType,
  PrismaClient,
  RoleType,
  SubmissionStatus,
} from "../src/generated/prisma/client";
import { projectSchemaToFields } from "../src/lib/form-builder/projection";
import { FormBuilderSchema } from "../src/lib/form-builder/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const regions = [
  { code: "RUSSIAN_FEDERATION", shortName: "РФ", fullName: "Российская Федерация" },
  { code: "ADYGEA", shortName: "Адыгея", fullName: "Республика Адыгея" },
  { code: "ALTAI_REP", shortName: "Алтай", fullName: "Республика Алтай" },
  { code: "BASHKORTOSTAN", shortName: "Башкортостан", fullName: "Республика Башкортостан" },
  { code: "BURYATIA", shortName: "Бурятия", fullName: "Республика Бурятия" },
  { code: "DAGESTAN", shortName: "Дагестан", fullName: "Республика Дагестан" },
  { code: "INGUSHETIA", shortName: "Ингушетия", fullName: "Республика Ингушетия" },
  { code: "KABARDINO_BALKARIA", shortName: "Кабардино-Балкария", fullName: "Кабардино-Балкарская Республика" },
  { code: "KALMYKIA", shortName: "Калмыкия", fullName: "Республика Калмыкия" },
  { code: "KARACHAY_CHERKESSIA", shortName: "Карачаево-Черкесия", fullName: "Карачаево-Черкесская Республика" },
  { code: "KARELIA", shortName: "Карелия", fullName: "Республика Карелия" },
  { code: "KOMI", shortName: "Коми", fullName: "Республика Коми" },
  { code: "CRIMEA", shortName: "Крым", fullName: "Республика Крым" },
  { code: "MARI_EL", shortName: "Марий Эл", fullName: "Республика Марий Эл" },
  { code: "MORDOVIA", shortName: "Мордовия", fullName: "Республика Мордовия" },
  { code: "SAKHA", shortName: "Якутия", fullName: "Республика Саха (Якутия)" },
  { code: "NORTH_OSSETIA", shortName: "Северная Осетия", fullName: "Республика Северная Осетия - Алания" },
  { code: "TATARSTAN", shortName: "Татарстан", fullName: "Республика Татарстан" },
  { code: "TUVA", shortName: "Тыва", fullName: "Республика Тыва" },
  { code: "UDMURTIA", shortName: "Удмуртия", fullName: "Удмуртская Республика" },
  { code: "KHAKASSIA", shortName: "Хакасия", fullName: "Республика Хакасия" },
  { code: "CHECHNYA", shortName: "Чечня", fullName: "Чеченская Республика" },
  { code: "CHUVASHIA", shortName: "Чувашия", fullName: "Чувашская Республика" },
  { code: "DONETSK", shortName: "ДНР", fullName: "Донецкая Народная Республика" },
  { code: "LUGANSK", shortName: "ЛНР", fullName: "Луганская Народная Республика" },
  { code: "ALTAI_KRAI", shortName: "Алтайский край", fullName: "Алтайский край" },
  { code: "KAMCHATKA", shortName: "Камчатский край", fullName: "Камчатский край" },
  { code: "KRASNODAR", shortName: "Краснодарский край", fullName: "Краснодарский край" },
  { code: "KRASNOYARSK", shortName: "Красноярский край", fullName: "Красноярский край" },
  { code: "PERM", shortName: "Пермский край", fullName: "Пермский край" },
  { code: "PRIMORSKY", shortName: "Приморский край", fullName: "Приморский край" },
  { code: "STAVROPOL", shortName: "Ставропольский край", fullName: "Ставропольский край" },
  { code: "KHABAROVSK", shortName: "Хабаровский край", fullName: "Хабаровский край" },
  { code: "ZABAIKALSKY", shortName: "Забайкальский край", fullName: "Забайкальский край" },
  { code: "AMUR", shortName: "Амурская область", fullName: "Амурская область" },
  { code: "ARKHANGELSK", shortName: "Архангельская область", fullName: "Архангельская область" },
  { code: "ASTRAKHAN", shortName: "Астраханская область", fullName: "Астраханская область" },
  { code: "BELGOROD", shortName: "Белгородская область", fullName: "Белгородская область" },
  { code: "BRYANSK", shortName: "Брянская область", fullName: "Брянская область" },
  { code: "VLADIMIR", shortName: "Владимирская область", fullName: "Владимирская область" },
  { code: "VOLGOGRAD", shortName: "Волгоградская область", fullName: "Волгоградская область" },
  { code: "VOLOGDA", shortName: "Вологодская область", fullName: "Вологодская область" },
  { code: "VORONEZH", shortName: "Воронежская область", fullName: "Воронежская область" },
  { code: "IVANOVO", shortName: "Ивановская область", fullName: "Ивановская область" },
  { code: "IRKUTSK", shortName: "Иркутская область", fullName: "Иркутская область" },
  { code: "KALININGRAD", shortName: "Калининградская область", fullName: "Калининградская область" },
  { code: "KALUGA", shortName: "Калужская область", fullName: "Калужская область" },
  { code: "KEMEROVO", shortName: "Кемеровская область", fullName: "Кемеровская область - Кузбасс" },
  { code: "KIROV", shortName: "Кировская область", fullName: "Кировская область" },
  { code: "KOSTROMA", shortName: "Костромская область", fullName: "Костромская область" },
  { code: "KURGAN", shortName: "Курганская область", fullName: "Курганская область" },
  { code: "KURSK", shortName: "Курская область", fullName: "Курская область" },
  { code: "LENINGRAD", shortName: "Ленинградская область", fullName: "Ленинградская область" },
  { code: "LIPETSK", shortName: "Липецкая область", fullName: "Липецкая область" },
  { code: "MAGADAN", shortName: "Магаданская область", fullName: "Магаданская область" },
  { code: "MOSCOW_OBLAST", shortName: "Московская область", fullName: "Московская область" },
  { code: "MURMANSK", shortName: "Мурманская область", fullName: "Мурманская область" },
  { code: "NIZHNY_NOVGOROD", shortName: "Нижегородская область", fullName: "Нижегородская область" },
  { code: "NOVGOROD", shortName: "Новгородская область", fullName: "Новгородская область" },
  { code: "NOVOSIBIRSK", shortName: "Новосибирская область", fullName: "Новосибирская область" },
  { code: "OMSK", shortName: "Омская область", fullName: "Омская область" },
  { code: "ORENBURG", shortName: "Оренбургская область", fullName: "Оренбургская область" },
  { code: "ORYOL", shortName: "Орловская область", fullName: "Орловская область" },
  { code: "PENZA", shortName: "Пензенская область", fullName: "Пензенская область" },
  { code: "PSKOV", shortName: "Псковская область", fullName: "Псковская область" },
  { code: "ROSTOV", shortName: "Ростовская область", fullName: "Ростовская область" },
  { code: "RYAZAN", shortName: "Рязанская область", fullName: "Рязанская область" },
  { code: "SAMARA", shortName: "Самарская область", fullName: "Самарская область" },
  { code: "SARATOV", shortName: "Саратовская область", fullName: "Саратовская область" },
  { code: "SAKHALIN", shortName: "Сахалинская область", fullName: "Сахалинская область" },
  { code: "SVERDLOVSK", shortName: "Свердловская область", fullName: "Свердловская область" },
  { code: "SMOLENSK", shortName: "Смоленская область", fullName: "Смоленская область" },
  { code: "TAMBOV", shortName: "Тамбовская область", fullName: "Тамбовская область" },
  { code: "TVER", shortName: "Тверская область", fullName: "Тверская область" },
  { code: "TOMSK", shortName: "Томская область", fullName: "Томская область" },
  { code: "TULA", shortName: "Тульская область", fullName: "Тульская область" },
  { code: "TYUMEN", shortName: "Тюменская область", fullName: "Тюменская область" },
  { code: "ULYANOVSK", shortName: "Ульяновская область", fullName: "Ульяновская область" },
  { code: "CHELYABINSK", shortName: "Челябинская область", fullName: "Челябинская область" },
  { code: "YAROSLAVL", shortName: "Ярославская область", fullName: "Ярославская область" },
  { code: "ZAPORIZHZHIA", shortName: "Запорожская область", fullName: "Запорожская область" },
  { code: "KHERSON", shortName: "Херсонская область", fullName: "Херсонская область" },
  { code: "MOSCOW", shortName: "Москва", fullName: "Город Москва" },
  { code: "SAINT_PETERSBURG", shortName: "Санкт-Петербург", fullName: "Город Санкт-Петербург" },
  { code: "SEVASTOPOL", shortName: "Севастополь", fullName: "Город Севастополь" },
  { code: "JEWISH_AO", shortName: "ЕАО", fullName: "Еврейская автономная область" },
  { code: "NENETS_AO", shortName: "Ненецкий АО", fullName: "Ненецкий автономный округ" },
  { code: "KHANTY_MANSI_AO", shortName: "ХМАО - Югра", fullName: "Ханты-Мансийский автономный округ - Югра" },
  { code: "CHUKOTKA_AO", shortName: "Чукотский АО", fullName: "Чукотский автономный округ" },
  { code: "YAMALO_NENETS_AO", shortName: "ЯНАО", fullName: "Ямало-Ненецкий автономный округ" },
];

const reportingYears = [
  { year: 2024, isOpenForInput: true, isPublished: true },
  { year: 2025, isOpenForInput: true, isPublished: false },
  { year: 2026, isOpenForInput: false, isPublished: false },
];

const formTypes = [
  { code: "F12", name: "Форма F12", description: "Базовая историческая форма из архива 2024 года." },
  { code: "F14", name: "Форма F14", description: "Базовая историческая форма из архива 2024 года." },
  { code: "F19", name: "Форма F19", description: "Базовая историческая форма из архива 2024 года." },
  { code: "F30", name: "Форма F30", description: "Базовая историческая форма из архива 2024 года." },
  { code: "F47", name: "Форма F47", description: "Базовая историческая форма из архива 2024 года." },
];

const seededTemplateFields: Record<
  string,
  { key: string; label: string; fieldType: string; unit?: string; isRequired?: boolean }[]
> = {
  F12: [
    { key: "pediatric_surgery_beds", label: "Число коек хирургических для детей", fieldType: "number", unit: "шт.", isRequired: true },
    { key: "pediatric_patients", label: "Число детей, получивших помощь", fieldType: "number", unit: "чел." },
    { key: "staff_surgeons", label: "Число врачей-хирургов", fieldType: "number", unit: "чел." },
  ],
  F14: [
    { key: "event_count", label: "Количество мероприятий", fieldType: "number", unit: "шт.", isRequired: true },
    { key: "participant_count", label: "Количество участников", fieldType: "number", unit: "чел." },
    { key: "program_hours", label: "Объем программы", fieldType: "number", unit: "час." },
  ],
  F19: [
    { key: "operations_total", label: "Общее число операций", fieldType: "number", unit: "шт.", isRequired: true },
    { key: "complications_total", label: "Число осложнений", fieldType: "number", unit: "шт." },
    { key: "postoperative_beds", label: "Послеоперационные койки", fieldType: "number", unit: "шт." },
  ],
  F30: [
    { key: "medical_units", label: "Количество подразделений", fieldType: "number", unit: "шт.", isRequired: true },
    { key: "specialists_total", label: "Количество специалистов", fieldType: "number", unit: "чел." },
    { key: "equipment_units", label: "Количество единиц оборудования", fieldType: "number", unit: "шт." },
  ],
  F47: [
    { key: "indicator_1", label: "Показатель 1", fieldType: "number", isRequired: false },
    { key: "indicator_2", label: "Показатель 2", fieldType: "number", isRequired: false },
    { key: "indicator_3", label: "Показатель 3", fieldType: "number", isRequired: false },
  ],
};

async function seedRegions() {
  for (const region of regions) {
    const createdRegion = await prisma.region.upsert({
      where: { code: region.code },
      update: {
        shortName: region.shortName,
        fullName: region.fullName,
      },
      create: region,
    });

    if (region.code === "RUSSIAN_FEDERATION") {
      continue;
    }

    await prisma.organization.upsert({
      where: {
        regionId_name: {
          regionId: createdRegion.id,
          name: `${region.fullName} — региональный центр`,
        },
      },
      update: {
        type: OrganizationType.REGION_CENTER,
      },
      create: {
        name: `${region.fullName} — региональный центр`,
        type: OrganizationType.REGION_CENTER,
        regionId: createdRegion.id,
      },
    });
  }
}

async function seedReportingYears() {
  for (const reportingYear of reportingYears) {
    await prisma.reportingYear.upsert({
      where: { year: reportingYear.year },
      update: reportingYear,
      create: reportingYear,
    });
  }
}

async function seedFormTypes() {
  for (const formType of formTypes) {
    await prisma.formType.upsert({
      where: { code: formType.code },
      update: {
        name: formType.name,
        description: formType.description,
      },
      create: formType,
    });
  }
}

async function seedFormTemplates() {
  const years = await prisma.reportingYear.findMany({
    orderBy: { year: "asc" },
  });

  const formTypeEntities = await prisma.formType.findMany();

  for (const formType of formTypeEntities) {
    const template = await prisma.formTemplate.upsert({
      where: {
        id: `${formType.code.toLowerCase()}-template`,
      },
      update: {
        name: `${formType.name} — базовый шаблон`,
        description: `Базовый шаблон для ${formType.name}.`,
      },
      create: {
        id: `${formType.code.toLowerCase()}-template`,
        formTypeId: formType.id,
        name: `${formType.name} — базовый шаблон`,
        description: `Базовый шаблон для ${formType.name}.`,
      },
    });

    const fields = seededTemplateFields[formType.code] ?? [
      { key: "indicator_1", label: "Показатель 1", fieldType: "number", isRequired: false },
      { key: "indicator_2", label: "Показатель 2", fieldType: "number", isRequired: false },
    ];

    for (const reportingYear of years) {
      const schemaJson: FormBuilderSchema = {
        meta: {
          formCode: formType.code,
          title: `${formType.name} за ${reportingYear.year}`,
          reportingYear: reportingYear.year,
          description: `Базовый табличный шаблон для ${formType.name}.`,
        },
        headerFields: [
          {
            id: "header_region_name",
            key: "region_name",
            label: "Регион",
            fieldType: "text",
            required: true,
            placeholder: "Наименование региона",
            helpText: null,
            options: [],
            validation: {},
          },
        ],
        tables: [
          {
            id: "table_main",
            title: "Основные показатели",
            description: "Главная статистическая таблица формы.",
            descriptorColumns: [
              {
                id: "descriptor_row_number",
                key: "row_number",
                label: "№ строки",
                width: 120,
                sticky: false,
              },
            ],
            columns: [
              {
                id: "column_value",
                key: "value",
                label: "Значение",
                fieldType: "number",
                unit: null,
                required: false,
                width: 220,
                sticky: false,
                placeholder: "Введите значение",
                helpText: null,
                options: [],
                validation: {},
              },
            ],
            rows: fields.map((field, index) => ({
              id: `row_${index + 1}`,
              key: field.key,
              label: field.label,
              description: field.unit ? `Единица измерения: ${field.unit}` : null,
              rowType: "data" as const,
              indent: 0,
              groupPrefix: null,
              descriptorValues: {
                descriptor_row_number: String(index + 1),
              },
            })),
            settings: {
              stickyHeader: true,
              stickyFirstColumn: true,
              horizontalScroll: true,
            },
          },
        ],
      };

      const version = await prisma.formTemplateVersion.upsert({
        where: {
          templateId_reportingYearId_version: {
            templateId: template.id,
            reportingYearId: reportingYear.id,
            version: 1,
          },
        },
        update: {
          title: `${formType.name} за ${reportingYear.year}`,
          versionStatus:
            reportingYear.year <= 2025
              ? FormTemplateVersionStatus.PUBLISHED
              : FormTemplateVersionStatus.DRAFT,
          schemaJson,
        },
        create: {
          templateId: template.id,
          reportingYearId: reportingYear.id,
          version: 1,
          title: `${formType.name} за ${reportingYear.year}`,
          versionStatus:
            reportingYear.year <= 2025
              ? FormTemplateVersionStatus.PUBLISHED
              : FormTemplateVersionStatus.DRAFT,
          schemaJson,
        },
      });

      await prisma.formField.deleteMany({
        where: {
          templateVersionId: version.id,
        },
      });

      const projectedFields = projectSchemaToFields(schemaJson).map((field, index) => {
        const sourceField = fields.find((item) => item.key === field.rowKey);

        return prisma.formField.create({
          data: {
            templateVersionId: version.id,
            key: field.key,
            label: field.label,
            section: field.section,
            tableId: field.tableId,
            rowId: field.rowId,
            rowKey: field.rowKey,
            columnId: field.columnId,
            columnKey: field.columnKey,
            fieldPath: field.fieldPath,
            fieldType: sourceField?.fieldType ?? field.fieldType,
            unit: sourceField?.unit ?? field.unit,
            placeholder: field.placeholder,
            helpText: field.helpText,
            sortOrder: index,
            isRequired: sourceField?.isRequired ?? field.isRequired,
            validationJson: field.validationJson ?? undefined,
          },
        });
      });

      await prisma.$transaction(projectedFields);
    }
  }
}

async function seedSuperadmin() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@stat.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "Admin12345!";
  const passwordHash = await hash(adminPassword, 10);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      fullName: "Суперадминистратор",
      passwordHash,
      isActive: true,
    },
    create: {
      email: adminEmail,
      fullName: "Суперадминистратор",
      passwordHash,
      isActive: true,
    },
  });

  const russianFederation = await prisma.region.upsert({
    where: { code: "RUSSIAN_FEDERATION" },
    update: {
      shortName: "РФ",
      fullName: "Российская Федерация",
    },
    create: {
      code: "RUSSIAN_FEDERATION",
      shortName: "РФ",
      fullName: "Российская Федерация",
    },
  });

  let federalCenter = await prisma.organization.findFirst({
    where: {
      name: "Федеральный центр",
      type: OrganizationType.FEDERAL_CENTER,
    },
  });

  if (!federalCenter) {
    federalCenter = await prisma.organization.create({
      data: {
        name: "Федеральный центр",
        type: OrganizationType.FEDERAL_CENTER,
        regionId: russianFederation.id,
      },
    });
  }

  const membership = await prisma.userMembership.findFirst({
    where: {
      userId: user.id,
      organizationId: federalCenter.id,
      role: RoleType.SUPERADMIN,
    },
  });

  if (!membership) {
    await prisma.userMembership.create({
      data: {
        userId: user.id,
        organizationId: federalCenter.id,
        role: RoleType.SUPERADMIN,
      },
    });
  }
}

async function seedDemoAccessAndAssignments() {
  const region = await prisma.region.findUnique({
    where: { code: "MOSCOW" },
  });

  if (!region) {
    return;
  }

  const regionCenter = await prisma.organization.findFirst({
    where: {
      regionId: region.id,
      type: OrganizationType.REGION_CENTER,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!regionCenter) {
    return;
  }

  const demoFacility = await prisma.organization.upsert({
    where: {
      regionId_name: {
        regionId: region.id,
        name: "Демо-оператор Москва",
      },
    },
    update: {
      type: OrganizationType.MEDICAL_FACILITY,
      parentId: regionCenter.id,
    },
    create: {
      name: "Демо-оператор Москва",
      type: OrganizationType.MEDICAL_FACILITY,
      regionId: region.id,
      parentId: regionCenter.id,
    },
  });

  const regionAdminPasswordHash = await hash(
    process.env.DEMO_REGION_ADMIN_PASSWORD ?? "RegionAdmin123!",
    10,
  );
  const operatorPasswordHash = await hash(
    process.env.DEMO_OPERATOR_PASSWORD ?? "Operator123!",
    10,
  );

  const regionAdmin = await prisma.user.upsert({
    where: {
      email: process.env.DEMO_REGION_ADMIN_EMAIL ?? "region-admin@stat.local",
    },
    update: {
      fullName: "Региональный администратор Москва",
      passwordHash: regionAdminPasswordHash,
      isActive: true,
    },
    create: {
      email: process.env.DEMO_REGION_ADMIN_EMAIL ?? "region-admin@stat.local",
      fullName: "Региональный администратор Москва",
      passwordHash: regionAdminPasswordHash,
      isActive: true,
    },
  });

  const operator = await prisma.user.upsert({
    where: {
      email: process.env.DEMO_OPERATOR_EMAIL ?? "operator@stat.local",
    },
    update: {
      fullName: "Оператор Москва",
      passwordHash: operatorPasswordHash,
      isActive: true,
    },
    create: {
      email: process.env.DEMO_OPERATOR_EMAIL ?? "operator@stat.local",
      fullName: "Оператор Москва",
      passwordHash: operatorPasswordHash,
      isActive: true,
    },
  });

  await prisma.userMembership.upsert({
    where: {
      userId_organizationId_role: {
        userId: regionAdmin.id,
        organizationId: regionCenter.id,
        role: RoleType.REGION_ADMIN,
      },
    },
    update: {},
    create: {
      userId: regionAdmin.id,
      organizationId: regionCenter.id,
      role: RoleType.REGION_ADMIN,
    },
  });

  await prisma.userMembership.upsert({
    where: {
      userId_organizationId_role: {
        userId: operator.id,
        organizationId: demoFacility.id,
        role: RoleType.OPERATOR,
      },
    },
    update: {},
    create: {
      userId: operator.id,
      organizationId: demoFacility.id,
      role: RoleType.OPERATOR,
    },
  });

  const reportingYear2024 = await prisma.reportingYear.findUnique({
    where: { year: 2024 },
  });

  if (!reportingYear2024) {
    return;
  }

  const publishedVersions2024 = await prisma.formTemplateVersion.findMany({
    where: {
      reportingYearId: reportingYear2024.id,
      versionStatus: FormTemplateVersionStatus.PUBLISHED,
    },
  });

  for (const version of publishedVersions2024) {
    const regionAssignment = await prisma.formAssignment.upsert({
      where: {
        templateVersionId_reportingYearId_regionId_organizationId: {
          templateVersionId: version.id,
          reportingYearId: reportingYear2024.id,
          regionId: region.id,
          organizationId: regionCenter.id,
        },
      },
      update: {
        status: FormAssignmentStatus.PUBLISHED,
      },
      create: {
        templateVersionId: version.id,
        reportingYearId: reportingYear2024.id,
        regionId: region.id,
        organizationId: regionCenter.id,
        status: FormAssignmentStatus.PUBLISHED,
      },
    });

    await prisma.formAssignment.upsert({
      where: {
        templateVersionId_reportingYearId_regionId_organizationId: {
          templateVersionId: version.id,
          reportingYearId: reportingYear2024.id,
          regionId: region.id,
          organizationId: demoFacility.id,
        },
      },
      update: {
        status: FormAssignmentStatus.PUBLISHED,
      },
      create: {
        templateVersionId: version.id,
        reportingYearId: reportingYear2024.id,
        regionId: region.id,
        organizationId: demoFacility.id,
        status: FormAssignmentStatus.PUBLISHED,
      },
    });

    const existingRegionSubmission = await prisma.submission.findFirst({
      where: {
        assignmentId: regionAssignment.id,
        organizationId: regionCenter.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!existingRegionSubmission) {
      await prisma.submission.create({
        data: {
          assignmentId: regionAssignment.id,
          organizationId: regionCenter.id,
          status: SubmissionStatus.DRAFT,
        },
      });
    }
  }
}

async function main() {
  await seedRegions();
  await seedReportingYears();
  await seedFormTypes();
  await seedFormTemplates();
  await seedSuperadmin();
  await seedDemoAccessAndAssignments();

  console.log(`Seed complete: ${regions.length} regions, ${reportingYears.length} reporting years, ${formTypes.length} form types.`);
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

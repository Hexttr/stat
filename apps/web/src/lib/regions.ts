import { Prisma } from "@/generated/prisma/client";

export const SUBJECT_REGION_WHERE = {
  subjectOktmoKey: {
    not: null,
  },
} satisfies Prisma.RegionWhereInput;

export function getScopedSubjectRegionFilter(scope: {
  isSuperadmin: boolean;
  manageableRegionIds: string[] | null;
}) {
  if (scope.isSuperadmin) {
    return SUBJECT_REGION_WHERE satisfies Prisma.RegionWhereInput;
  }

  return {
    id: {
      in: scope.manageableRegionIds ?? [],
    },
    subjectOktmoKey: {
      not: null,
    },
  } satisfies Prisma.RegionWhereInput;
}

import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import {
  importCanonicalDocxArchiveRegistry,
  importCanonicalDocxValuesToStaging,
} from "../src/lib/archive/docx-service";
import {
  applyArchiveF47PilotMapping,
  applyArchiveF30PilotMapping,
  applyArchiveF19PilotMapping,
  applyArchiveF14PilotMapping,
  applyArchiveF12PilotMapping,
  createArchivePilotRegionSubmissions,
  enrichArchiveF47Structure,
  enrichArchiveF30Structure,
  enrichArchiveF19Structure,
  enrichArchiveF14Structure,
  enrichArchiveF12Structure,
  ensureArchiveYearlyFormVersions,
  importArchiveRawValuesToStaging,
  importHandoffArchiveRegistry,
  syncCanonicalRegionsFromHandoff,
} from "../src/lib/archive/service";
import { closeHandoffPool } from "../src/lib/archive/handoff-db";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  const command = process.argv[2];
  const batchId = getArgValue("--batch-id") ?? undefined;

  switch (command) {
    case "sync-regions": {
      const result = await syncCanonicalRegionsFromHandoff();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "import-registry": {
      const result = await importHandoffArchiveRegistry();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "import-docx-registry": {
      const result = await importCanonicalDocxArchiveRegistry();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "prepare-forms": {
      const result = await ensureArchiveYearlyFormVersions();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "pilot": {
      const formCode = getArgValue("--form");
      const yearRaw = getArgValue("--year");

      if (!formCode || !yearRaw) {
        throw new Error("Для pilot укажите --form F12 --year 2024");
      }

      const result = await createArchivePilotRegionSubmissions({
        formCode: formCode.toUpperCase(),
        year: Number(yearRaw),
        batchId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "pull-values": {
      const formCode = getArgValue("--form") ?? undefined;
      const yearRaw = getArgValue("--year");
      const limitRaw = getArgValue("--limit");
      const offsetRaw = getArgValue("--offset");

      const result = await importArchiveRawValuesToStaging({
        formCode: formCode?.toUpperCase(),
        year: yearRaw ? Number(yearRaw) : undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
        offset: offsetRaw ? Number(offsetRaw) : undefined,
        batchId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "pull-docx-values": {
      const formCode = getArgValue("--form") ?? undefined;
      const yearRaw = getArgValue("--year");
      const limitRaw = getArgValue("--limit");
      const offsetRaw = getArgValue("--offset");

      const result = await importCanonicalDocxValuesToStaging({
        formCode: formCode?.toUpperCase(),
        year: yearRaw ? Number(yearRaw) : undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
        offset: offsetRaw ? Number(offsetRaw) : undefined,
        matchedOnly: hasFlag("--matched-only"),
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "map-f12": {
      const yearRaw = getArgValue("--year");
      const limitRaw = getArgValue("--limit");
      const offsetRaw = getArgValue("--offset");

      const result = await applyArchiveF12PilotMapping({
        year: yearRaw ? Number(yearRaw) : undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
        offset: offsetRaw ? Number(offsetRaw) : undefined,
        batchId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "map-f14": {
      const yearRaw = getArgValue("--year");
      const limitRaw = getArgValue("--limit");
      const offsetRaw = getArgValue("--offset");

      const result = await applyArchiveF14PilotMapping({
        year: yearRaw ? Number(yearRaw) : undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
        offset: offsetRaw ? Number(offsetRaw) : undefined,
        batchId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "map-f19": {
      const yearRaw = getArgValue("--year");
      const limitRaw = getArgValue("--limit");
      const offsetRaw = getArgValue("--offset");

      const result = await applyArchiveF19PilotMapping({
        year: yearRaw ? Number(yearRaw) : undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
        offset: offsetRaw ? Number(offsetRaw) : undefined,
        batchId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "map-f30": {
      const yearRaw = getArgValue("--year");
      const limitRaw = getArgValue("--limit");
      const offsetRaw = getArgValue("--offset");

      const result = await applyArchiveF30PilotMapping({
        year: yearRaw ? Number(yearRaw) : undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
        offset: offsetRaw ? Number(offsetRaw) : undefined,
        batchId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "map-f47": {
      const yearRaw = getArgValue("--year");
      const limitRaw = getArgValue("--limit");
      const offsetRaw = getArgValue("--offset");

      const result = await applyArchiveF47PilotMapping({
        year: yearRaw ? Number(yearRaw) : undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
        offset: offsetRaw ? Number(offsetRaw) : undefined,
        batchId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "enrich-f12": {
      const yearRaw = getArgValue("--year");
      const versionId = getArgValue("--version-id") ?? undefined;

      const result = await enrichArchiveF12Structure({
        year: yearRaw ? Number(yearRaw) : undefined,
        versionId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "enrich-f14": {
      const yearRaw = getArgValue("--year");
      const versionId = getArgValue("--version-id") ?? undefined;

      const result = await enrichArchiveF14Structure({
        year: yearRaw ? Number(yearRaw) : undefined,
        versionId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "enrich-f19": {
      const yearRaw = getArgValue("--year");
      const versionId = getArgValue("--version-id") ?? undefined;

      const result = await enrichArchiveF19Structure({
        year: yearRaw ? Number(yearRaw) : undefined,
        versionId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "enrich-f30": {
      const yearRaw = getArgValue("--year");
      const versionId = getArgValue("--version-id") ?? undefined;

      const result = await enrichArchiveF30Structure({
        year: yearRaw ? Number(yearRaw) : undefined,
        versionId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "enrich-f47": {
      const yearRaw = getArgValue("--year");
      const versionId = getArgValue("--version-id") ?? undefined;

      const result = await enrichArchiveF47Structure({
        year: yearRaw ? Number(yearRaw) : undefined,
        versionId,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default:
      throw new Error(
        "Неизвестная команда. Используйте: sync-regions | import-registry | import-docx-registry | prepare-forms | pilot | pull-values | pull-docx-values | map-f12 | map-f14 | map-f19 | map-f30 | map-f47 | enrich-f12 | enrich-f14 | enrich-f19 | enrich-f30 | enrich-f47",
      );
  }
}

async function cleanup() {
  await Promise.allSettled([prisma.$disconnect(), closeHandoffPool()]);
}

main()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch((error) => {
    Promise.resolve()
      .then(async () => {
        console.error(error);
        await cleanup();
      })
      .finally(() => {
        process.exit(1);
      });
  });

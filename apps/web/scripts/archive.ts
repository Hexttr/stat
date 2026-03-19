import "dotenv/config";

import {
  applyArchiveF12PilotMapping,
  createArchivePilotRegionSubmissions,
  enrichArchiveF12Structure,
  ensureArchiveYearlyFormVersions,
  importArchiveRawValuesToStaging,
  importHandoffArchiveRegistry,
  syncCanonicalRegionsFromHandoff,
} from "../src/lib/archive/service";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const command = process.argv[2];

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
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "pull-values": {
      const formCode = getArgValue("--form") ?? undefined;
      const yearRaw = getArgValue("--year");
      const limitRaw = getArgValue("--limit");

      const result = await importArchiveRawValuesToStaging({
        formCode: formCode?.toUpperCase(),
        year: yearRaw ? Number(yearRaw) : undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "map-f12": {
      const yearRaw = getArgValue("--year");
      const limitRaw = getArgValue("--limit");

      const result = await applyArchiveF12PilotMapping({
        year: yearRaw ? Number(yearRaw) : undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
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
    default:
      throw new Error(
        "Неизвестная команда. Используйте: sync-regions | import-registry | prepare-forms | pilot | pull-values | map-f12 | enrich-f12",
      );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

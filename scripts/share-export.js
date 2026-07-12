import { initializeDatabase } from "../app/db/database.js";
import { createShareZip } from "../app/services/share-export.service.js";

initializeDatabase();

function usage() {
  console.log(`
Enjoy Journal — Share Export

Usage:
  yarn share:export                       Export all ready lessons.
  yarn share:export --list                List exportable lessons and exit.
  yarn share:export [lessonId ...]        Export only the given lesson ids.
  yarn share:export --no-media            Skip media files.
  yarn share:export --out path/file.zip   Custom output location.
`);
}

function parseArgs(argv) {
  const args = { list: false, out: null, noMedia: false, lessonIds: [], nextIsOut: false };
  for (const token of argv) {
    if (token === "--list") args.list = true;
    else if (token === "--no-media") args.noMedia = true;
    else if (token === "--out" || token === "-o") args.nextIsOut = true;
    else if (token.startsWith("--out=")) args.out = token.slice("--out=".length);
    else if (token === "-h" || token === "--help") {
      usage();
      process.exit(0);
    } else if (args.nextIsOut) {
      args.out = token;
      args.nextIsOut = false;
    } else if (!token.startsWith("--")) {
      args.lessonIds.push(token);
    }
  }
  return args;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    const { listExportableShareLessons, buildSlug } = await import("../app/services/share.service.js");
    const exportable = listExportableShareLessons();
    if (!exportable.length) {
      console.log("No ready lessons found.");
      return;
    }
    console.log("Exportable lessons:");
    for (const item of exportable) {
      const slug = buildSlug({ title: item.title, sourceUrl: item.sourceUrl });
      console.log(`  ${item.id}  ${item.title}  [${slug}]`);
    }
    return;
  }

  const result = await createShareZip({
    lessonIds: args.lessonIds.length ? args.lessonIds : undefined,
    noMedia: args.noMedia,
    outPath: args.out || undefined
  });

  console.log(`Exported ${result.count} lesson(s) -> ${result.path}`);
  for (const entry of result.lessons) {
    const media = [entry.media.video && "video", entry.media.audio && "audio", entry.media.poster && "poster"]
      .filter(Boolean)
      .join("/") || "no media";
    console.log(`  ${entry.slug}  ${entry.title}  [${media}]`);
  }

  console.log("\nUpload this zip to Google Drive, then import on another machine:");
  console.log(`  yarn share:import ${result.path}`);
  console.log("Or use the Share page in the web app to import via upload.");
}

run().catch((error) => {
  console.error(error?.stack || error?.message || "Export failed.");
  process.exit(1);
});
import fs from "node:fs";
import path from "node:path";

import { initializeDatabase } from "../app/db/database.js";
import { importShareFromPath } from "../app/services/share-import.service.js";

initializeDatabase();

function usage() {
  console.log(`
Enjoy Journal — Share Import

Usage:
  yarn share:import path/to/enjoy-journal-<timestamp>.zip
  yarn share:import path/to/enjoy-journal-<timestamp>.zip --dry-run

Import a previously exported zip into this local database.
`);
}

function parseArgs(argv) {
  const args = { zipPath: null, dryRun: false };
  for (const token of argv) {
    if (token === "-h" || token === "--help") {
      usage();
      process.exit(0);
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (!token.startsWith("--") && !args.zipPath) {
      args.zipPath = token;
    }
  }
  return args;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.zipPath) {
    usage();
    process.exit(1);
  }

  const zipPath = path.resolve(process.cwd(), args.zipPath);
  if (!fs.existsSync(zipPath)) {
    console.error(`Zip file not found: ${zipPath}`);
    process.exit(1);
  }

  const { manifest, results } = await importShareFromPath(zipPath, { dryRun: args.dryRun });

  console.log(`\nImporting ${manifest.lessons.length} lesson(s) from: ${path.basename(zipPath)}`);

  const counts = {};
  for (const result of results) {
    counts[result.status] = (counts[result.status] || 0) + 1;
  }
  for (const [status, count] of Object.entries(counts)) {
    console.log(`  ${status}: ${count}`);
  }

  if (results.some((r) => r.status !== "skipped-existing" && r.status !== "skipped-deleted")) {
    console.log("");
    for (const result of results) {
      const note = result.inboxId ? ` (${result.inboxId})` : result.error ? ` [${result.error}]` : "";
      console.log(`  ${result.status.padEnd(18)}  ${result.title}${note}`);
    }
  }

  if (args.dryRun) {
    console.log("\nDry run — no changes applied.");
  }
}

run().catch((error) => {
  console.error(error?.stack || error?.message || "Import failed.");
  process.exit(1);
});
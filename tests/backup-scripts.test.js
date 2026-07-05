import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);
const expectedScripts = {
  "backup:setup": "bash scripts/backup-setup.sh",
  backup: "bash scripts/backup.sh",
  "backup:list": "bash scripts/backup-list.sh",
  "backup:restore": "bash scripts/backup-restore.sh",
  "backup:check": "bash scripts/backup-check.sh",
};

test("package.json exposes the expected restic backup commands", () => {
  for (const [name, command] of Object.entries(expectedScripts)) {
    assert.equal(
      packageJson.scripts[name],
      command,
      `Expected ${name} to be registered`,
    );
  }
});

test("backup helper scripts exist", () => {
  for (const script of Object.values(expectedScripts).map((command) =>
    command.split(" ").pop(),
  )) {
    const scriptPath = path.join(repoRoot, script);
    assert.ok(fs.existsSync(scriptPath), `Expected ${script} to exist`);
  }
});

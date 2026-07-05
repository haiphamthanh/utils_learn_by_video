#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

VERSION="$(node --input-type=module <<'NODE'
import fs from "node:fs";
const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
console.log(manifest.version);
NODE
)"

OUTPUT="dist/enjoy-journal-extension-v${VERSION}.zip"
mkdir -p dist
rm -f "$OUTPUT"

python3 - "$OUTPUT" <<'PY'
from pathlib import Path
import sys
import zipfile

output = Path(sys.argv[1])
extension = Path("extension")

with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(extension.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(extension))

print(f"Created {output}")
PY

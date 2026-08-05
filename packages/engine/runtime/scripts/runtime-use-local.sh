#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-wasm32}"
ARCHIVE="${2:-$ROOT/build/local-artifacts/libembedpdf-pdf-runtime-$TARGET-local.tar.gz}"
MANIFEST="$ROOT/engine-runtime-build.local.json"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "missing local artifact: $ARCHIVE" >&2
  exit 1
fi

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "missing sha256 checksum tool: install shasum or sha256sum" >&2
    exit 1
  fi
}

SHA256="$(sha256_file "$ARCHIVE")"
URL="file://$ARCHIVE"

node - <<'NODE' "$MANIFEST" "$TARGET" "$URL" "$SHA256"
const fs = require('node:fs');
const [file, target, url, sha256] = process.argv.slice(2);
let manifest = { fork: 'embedpdf/runtime', sha: 'local', artifacts: {} };
if (fs.existsSync(file)) manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.artifacts ??= {};
manifest.artifacts[target] = { url, sha256 };
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
NODE

echo "$MANIFEST"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"
PIN_FILE="${PDF_RUNTIME_BUILD_FILE:-$ROOT/engine-runtime-build.json}"
OUT_DIR="${PDF_RUNTIME_LIB_DIR:-$ROOT/build/libpdfium}"

if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <target>" >&2
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

ARTIFACT_JSON="$(node -e "
const fs = require('node:fs');
const file = process.argv[1];
const target = process.argv[2];
const pin = JSON.parse(fs.readFileSync(file, 'utf8'));
const artifact = pin.artifacts && pin.artifacts[target];
if (!artifact) {
  console.error('unknown target: ' + target);
  process.exit(2);
}
if (!artifact.url || !artifact.sha256) {
  console.error('missing url or sha256 for target: ' + target);
  process.exit(3);
}
process.stdout.write(JSON.stringify(artifact));
" "$PIN_FILE" "$TARGET")"

URL="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).url)" "$ARTIFACT_JSON")"
SHA256="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).sha256)" "$ARTIFACT_JSON")"

DEST="$OUT_DIR/$TARGET"
CACHE="$ROOT/build/cache"
ARCHIVE="$CACHE/libembedpdf-pdf-runtime-$TARGET.tar.gz"

mkdir -p "$CACHE" "$DEST"

needs_refresh() {
  [[ ! -f "$ARCHIVE" ]] && return 0
  local cached_sha
  cached_sha="$(sha256_file "$ARCHIVE")"
  [[ "$cached_sha" != "$SHA256" ]]
}

if needs_refresh; then
  echo "Downloading $TARGET from $URL"
  if [[ "$URL" == file://* ]]; then
    LOCAL_PATH="${URL#file://}"
    cp "$LOCAL_PATH" "$ARCHIVE"
  else
    curl -fL "$URL" -o "$ARCHIVE"
  fi
fi

ACTUAL_SHA="$(sha256_file "$ARCHIVE")"
if [[ "$ACTUAL_SHA" != "$SHA256" ]]; then
  echo "sha256 mismatch for $ARCHIVE" >&2
  echo "expected: $SHA256" >&2
  echo "actual:   $ACTUAL_SHA" >&2
  rm -f "$ARCHIVE"
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
tar -xzf "$ARCHIVE" -C "$DEST"

echo "$DEST"

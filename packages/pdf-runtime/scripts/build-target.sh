#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <target>" >&2
  exit 1
fi

"$ROOT/scripts/fetch-libpdfium.sh" "$TARGET"
node "$ROOT/build/generate-functions.mjs" "$TARGET"
node "$ROOT/build/generate-runtime-methods.mjs" "$ROOT/build/generated"

if [[ "$TARGET" == "wasm32" ]]; then
  PDF_RUNTIME_TARGET="$TARGET" bash "$ROOT/build/compile.esm.sh"
  exit 0
fi

node "$ROOT/build/generate-napi-binding.mjs" "$TARGET"

case "$TARGET" in
  darwin-arm64|linux-arm64|linuxmusl-arm64|win32-arm64)
    ARCH="arm64"
    ;;
  darwin-x64|linux-x64|linuxmusl-x64|win32-x64)
    ARCH="x64"
    ;;
  *)
    echo "unknown native target: $TARGET" >&2
    exit 1
    ;;
esac

LIB_DIR="$ROOT/build/libpdfium/$TARGET"
cmake-js compile \
  --directory "$ROOT/build" \
  --arch "$ARCH" \
  --CDPDF_RUNTIME_TARGET="$TARGET" \
  --CDPDFIUM_LIB_DIR="$LIB_DIR/lib" \
  --CDPDFIUM_INCLUDE_DIR="$LIB_DIR/include"

# Replace, never overwrite: `cp` onto an existing binary rewrites the SAME
# inode, and the macOS kernel's per-inode code-signature cache then kills
# the next process to dlopen it (SIGKILL: Code Signature Invalid) even
# though `codesign -vv` reports the file as valid. Copying to a temp name
# and renaming lands the bytes on a fresh inode, atomically.
install_binary() {
  local src="$1" dst="$2"
  cp "$src" "$dst.tmp"
  mv -f "$dst.tmp" "$dst"
}

mkdir -p "$ROOT/npm/$TARGET/lib"
install_binary "$ROOT/build/build/Release/pdf-runtime.node" "$ROOT/npm/$TARGET/lib/pdf-runtime.node"
case "$TARGET" in
  win32-*)
    install_binary "$LIB_DIR/bin/pdfium.dll" "$ROOT/npm/$TARGET/lib/pdfium.dll"
    ;;
  darwin-*)
    install_binary "$LIB_DIR/lib/libpdfium.dylib" "$ROOT/npm/$TARGET/lib/libpdfium.dylib"
    ;;
  linux-*)
    if [[ -f "$LIB_DIR/lib/libpdfium.so" ]]; then
      install_binary "$LIB_DIR/lib/libpdfium.so" "$ROOT/npm/$TARGET/lib/libpdfium.so"
    fi
    ;;
esac

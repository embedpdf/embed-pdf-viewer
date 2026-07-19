#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:-all}"

check() {
  test -s "$root/$1" || { echo "missing $1" >&2; exit 1; }
}

# Require the dynamic libpdfium to ship beside pdf-runtime.node whenever the
# addon links it dynamically (rpath $ORIGIN / @loader_path). Statically-linked
# targets have no NEEDED entry and are skipped.
check_native_deps() {
  local node="$root/npm/$1/lib/pdf-runtime.node"
  case "$1" in
    darwin-*)
      if otool -L "$node" 2>/dev/null | grep -q 'libpdfium\.dylib'; then
        check "npm/$1/lib/libpdfium.dylib"
      fi
      ;;
    linux-*|linuxmusl-*)
      if { objdump -p "$node" 2>/dev/null || readelf -d "$node" 2>/dev/null; } | grep -q 'libpdfium\.so'; then
        check "npm/$1/lib/libpdfium.so"
      fi
      ;;
  esac
}

check_target() {
  case "$1" in
    wasm32)
      check npm/wasm32/lib/pdfium.browser.js
      check npm/wasm32/lib/pdfium.node.js
      check npm/wasm32/lib/pdfium.node.cjs
      check npm/wasm32/lib/pdfium.wasm
      ;;
    win32-*)
      check "npm/$1/lib/pdf-runtime.node"
      check "npm/$1/lib/pdfium.dll"
      ;;
    *)
      check "npm/$1/lib/pdf-runtime.node"
      check_native_deps "$1"
      ;;
  esac
}

if [[ "$target" != "all" ]]; then
  check_target "$target"
  exit 0
fi

for t in wasm32 darwin-arm64 darwin-x64 linux-x64 linux-arm64 \
         linuxmusl-x64 linuxmusl-arm64 win32-x64 win32-arm64; do
  check_target "$t"
done
echo "all pdf-runtime payloads present"

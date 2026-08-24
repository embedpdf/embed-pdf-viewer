#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:-all}"

check() {
  test -s "$root/$1" || { echo "missing $1" >&2; exit 1; }
}

reject() {
  test ! -e "$root/$1" || { echo "legacy runtime artifact must not be shipped: $1" >&2; exit 1; }
}

# Require the dynamic libembedpdf to ship beside pdf-runtime.node whenever the
# addon links it dynamically (rpath $ORIGIN / @loader_path). Musl targets are
# statically linked and therefore have no shared-library dependency.
#
# Dependency checks must run wherever verification happens: each target's
# builder verifies on its native runner, but the release job re-verifies the
# FULL payload set on Linux (no otool there). Prefer the real toolchain when
# it can read the binary; otherwise fall back to scanning the load commands
# as raw strings — install names are embedded verbatim in the binary, and the
# paired `reject` of the legacy filename keeps the fallback honest.
links_dep() {
  local node="$1" want="$2" format="$3"
  case "$format" in
    macho)
      if command -v otool >/dev/null 2>&1; then
        otool -L "$node" 2>/dev/null | grep -q "$want" && return 0
      fi
      ;;
    elf)
      if command -v objdump >/dev/null 2>&1 || command -v readelf >/dev/null 2>&1; then
        { objdump -p "$node" 2>/dev/null || readelf -d "$node" 2>/dev/null; } |
          grep -q "$want" && return 0
      fi
      ;;
  esac
  grep -aq "$want" "$node"
}

check_native_deps() {
  local node="$root/npm/$1/lib/pdf-runtime.node"
  case "$1" in
    darwin-*)
      links_dep "$node" '@rpath/libembedpdf\.dylib' macho || {
        echo "missing @rpath/libembedpdf.dylib dependency: npm/$1/lib/pdf-runtime.node" >&2
        exit 1
      }
      check "npm/$1/lib/libembedpdf.dylib"
      reject "npm/$1/lib/libpdfium.dylib"
      ;;
    linux-*)
      links_dep "$node" 'libembedpdf\.so' elf || {
        echo "missing libembedpdf.so dependency: npm/$1/lib/pdf-runtime.node" >&2
        exit 1
      }
      check "npm/$1/lib/libembedpdf.so"
      reject "npm/$1/lib/libpdfium.so"
      ;;
    linuxmusl-*)
      reject "npm/$1/lib/libembedpdf.so"
      reject "npm/$1/lib/libpdfium.so"
      ;;
  esac
}

check_target() {
  case "$1" in
    wasm32)
      check npm/wasm32/lib/embedpdf.browser.js
      check npm/wasm32/lib/embedpdf.node.js
      check npm/wasm32/lib/embedpdf.node.cjs
      check npm/wasm32/lib/embedpdf.wasm
      ;;
    win32-*)
      check "npm/$1/lib/pdf-runtime.node"
      check "npm/$1/lib/embedpdf.dll"
      reject "npm/$1/lib/pdfium.dll"
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

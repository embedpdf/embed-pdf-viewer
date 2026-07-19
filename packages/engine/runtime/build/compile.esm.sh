#!/usr/bin/env bash
# Link the wasm32 artifacts: ONE shared pdfium.wasm + three environment-pure
# JS glues around it.
#
#   pdfium.browser.js  ESM  -sENVIRONMENT=web,worker  (zero Node branches)
#   pdfium.node.js     ESM  -sENVIRONMENT=node
#   pdfium.node.cjs    CJS  -sENVIRONMENT=node
#
# Environment forks live in the package's export conditions, NOT in a
# universal loader: a universal glue's unused Node branches import Node
# builtins, which strict browser bundlers (Angular/esbuild) refuse to resolve
# — Vite merely papers over it with stubs. Limiting -sENVIRONMENT removes the
# excluded environments' support code at the source.
#
# Each glue is linked in its own temp dir as `pdfium.{js,cjs}` so all of them
# reference the SAME wasm basename (`pdfium.wasm`, resolved relative to the
# glue via import.meta.url / __dirname); the wasm outputs are verified
# identical and published once.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${PDF_RUNTIME_TARGET:-wasm32}"
LIB_DIR="$ROOT/build/libpdfium/$TARGET"
OUT_DIR="$ROOT/npm/wasm32/lib"
GEN_DIR="$ROOT/build/generated"

mkdir -p "$OUT_DIR"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# args: <out-file> <environment> [extra flags...]
link() {
  local out="$1" environment="$2"
  shift 2
  em++ "$LIB_DIR/lib/libpdfium.a" \
    -sENVIRONMENT="$environment" \
    -sMODULARIZE=1 \
    -sWASM=1 \
    -sALLOW_MEMORY_GROWTH=1 \
    -sALLOW_TABLE_GROWTH=1 \
    -sEXPORT_NAME=createPdfRuntimeWasm \
    -sASSERTIONS=1 \
    -sEXPORTED_RUNTIME_METHODS="$(cat "$GEN_DIR/exported-runtime-methods.txt")" \
    -sEXPORTED_FUNCTIONS="$(cat "$GEN_DIR/exported-functions.txt")" \
    -I"$LIB_DIR/include" \
    -std=c++17 \
    -Wall \
    --no-entry \
    "$@" \
    -o "$out"
}

mkdir -p "$TMP_DIR/browser" "$TMP_DIR/node-esm" "$TMP_DIR/node-cjs"
link "$TMP_DIR/browser/pdfium.js" "web,worker" -sEXPORT_ES6=1
link "$TMP_DIR/node-esm/pdfium.js" "node" -sEXPORT_ES6=1
link "$TMP_DIR/node-cjs/pdfium.cjs" "node"

# The wasm must be environment-independent (ENVIRONMENT only shapes the JS
# glue). Verify, then publish one copy every glue's `pdfium.wasm` reference
# resolves to.
cmp "$TMP_DIR/browser/pdfium.wasm" "$TMP_DIR/node-esm/pdfium.wasm"
cmp "$TMP_DIR/browser/pdfium.wasm" "$TMP_DIR/node-cjs/pdfium.wasm"

rm -f "$OUT_DIR/pdfium.js" "$OUT_DIR/pdfium.cjs" # pre-split universal glues
cp "$TMP_DIR/browser/pdfium.js" "$OUT_DIR/pdfium.browser.js"
cp "$TMP_DIR/node-esm/pdfium.js" "$OUT_DIR/pdfium.node.js"
cp "$TMP_DIR/node-cjs/pdfium.cjs" "$OUT_DIR/pdfium.node.cjs"
cp "$TMP_DIR/browser/pdfium.wasm" "$OUT_DIR/pdfium.wasm"

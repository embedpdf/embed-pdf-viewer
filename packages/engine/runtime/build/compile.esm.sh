#!/usr/bin/env bash
# Link the wasm32 artifacts: ONE shared embedpdf.wasm + three environment-pure
# JS glues around it.
#
#   embedpdf.browser.js  ESM  -sENVIRONMENT=web,worker  (zero Node branches)
#   embedpdf.node.js     ESM  -sENVIRONMENT=node
#   embedpdf.node.cjs    CJS  -sENVIRONMENT=node
#
# Environment forks live in the package's export conditions, NOT in a
# universal loader: a universal glue's unused Node branches import Node
# builtins, which strict browser bundlers (Angular/esbuild) refuse to resolve
# — Vite merely papers over it with stubs. Limiting -sENVIRONMENT removes the
# excluded environments' support code at the source.
#
# Each glue is linked in its own temp dir as `embedpdf.{js,cjs}` so all of them
# reference the SAME wasm basename (`embedpdf.wasm`, resolved relative to the
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
  em++ "$LIB_DIR/lib/libembedpdf.a" \
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
link "$TMP_DIR/browser/embedpdf.js" "web,worker" -sEXPORT_ES6=1
link "$TMP_DIR/node-esm/embedpdf.js" "node" -sEXPORT_ES6=1
link "$TMP_DIR/node-cjs/embedpdf.cjs" "node"

# The wasm must be environment-independent (ENVIRONMENT only shapes the JS
# glue). Verify, then publish one copy every glue's `embedpdf.wasm` reference
# resolves to.
cmp "$TMP_DIR/browser/embedpdf.wasm" "$TMP_DIR/node-esm/embedpdf.wasm"
cmp "$TMP_DIR/browser/embedpdf.wasm" "$TMP_DIR/node-cjs/embedpdf.wasm"

# pre-split universal glues + pre-rename pdfium.* outputs
rm -f "$OUT_DIR/embedpdf.js" "$OUT_DIR/embedpdf.cjs" "$OUT_DIR"/pdfium.*
cp "$TMP_DIR/browser/embedpdf.js" "$OUT_DIR/embedpdf.browser.js"
cp "$TMP_DIR/node-esm/embedpdf.js" "$OUT_DIR/embedpdf.node.js"
cp "$TMP_DIR/node-cjs/embedpdf.cjs" "$OUT_DIR/embedpdf.node.cjs"
cp "$TMP_DIR/browser/embedpdf.wasm" "$OUT_DIR/embedpdf.wasm"

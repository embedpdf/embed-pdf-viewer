#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "missing docker on PATH" >&2
  exit 1
fi

extra_args=("$@")
if [[ ${#extra_args[@]} -gt 0 ]]; then
  joined_args="${extra_args[*]}"
  export PDFIUM_GTEST_ARGS="${PDFIUM_GTEST_ARGS:+$PDFIUM_GTEST_ARGS }$joined_args"
fi

export PDFIUM_TEST_SUITE="${PDFIUM_TEST_SUITE:-embedder}"
export PDF_RUNTIME_SYNC="${PDF_RUNTIME_SYNC:-local}"
export PDFIUM_UNIT_FILTER="${PDFIUM_UNIT_FILTER:-}"
export PDFIUM_EMBEDDER_FILTER="${PDFIUM_EMBEDDER_FILTER:-}"
export PDFIUM_GTEST_ARGS="${PDFIUM_GTEST_ARGS:-}"

image_name="pdf-runtime-pdf-runtime-linux-test"
WORKSPACE="$(cd "$ROOT/../.." && pwd)"
LINUX_CLANG_VOLUME="pdf-runtime_linux-llvm-build"
LINUX_CLANG_DIR="/workspace/packages/pdf-runtime/runtime-src/third_party/llvm-build/Release+Asserts"
LINUX_CLANG_URL="https://commondatastorage.googleapis.com/chromium-browser-clang/Linux_x64/clang-llvmorg-23-init-2224-g5bd8dadb-1.tar.xz"

echo "=== building pdf-runtime-linux-test image ==="
docker build \
  --progress=plain \
  -t "$image_name" \
  -f "$ROOT/Dockerfile" \
  "$ROOT"

echo "=== running pdf-runtime-linux-test ==="
docker run --rm \
  --platform linux/amd64 \
  -v "$WORKSPACE:/workspace" \
  -v pdf-runtime_pdf-runtime-gclient:/root/.cache \
  -v "$LINUX_CLANG_VOLUME:$LINUX_CLANG_DIR" \
  -w /workspace/packages/pdf-runtime \
  -e PDF_RUNTIME_SYNC \
  -e PDF_RUNTIME_TARGET_OS_LIST=linux \
  -e PDFIUM_TEST_SUITE \
  -e PDFIUM_UNIT_FILTER \
  -e PDFIUM_EMBEDDER_FILTER \
  -e PDFIUM_GTEST_ARGS \
  -e LINUX_CLANG_DIR="$LINUX_CLANG_DIR" \
  -e LINUX_CLANG_URL="$LINUX_CLANG_URL" \
  "$image_name" \
  bash -lc '
    set -euo pipefail
    if [[ ! -f "$LINUX_CLANG_DIR/lib/clang/23/lib/x86_64-unknown-linux-gnu/libclang_rt.builtins.a" ]]; then
      echo "=== installing Linux clang into Docker volume ==="
      tmp="$(mktemp -d)"
      curl -fsSL "$LINUX_CLANG_URL" -o "$tmp/clang.tar.xz"
      mkdir -p "$LINUX_CLANG_DIR"
      tar -xJf "$tmp/clang.tar.xz" -C "$LINUX_CLANG_DIR"
      if [[ ! -x "$LINUX_CLANG_DIR/bin/clang" ]]; then
        nested_dir="$(find "$LINUX_CLANG_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
        if [[ -n "$nested_dir" && -x "$nested_dir/bin/clang" ]]; then
          cp -a "$nested_dir"/. "$LINUX_CLANG_DIR"/
          rm -rf "$nested_dir"
        fi
      fi
      rm -rf "$tmp"
    fi
    bash ./scripts/test-pdfium.sh
  '

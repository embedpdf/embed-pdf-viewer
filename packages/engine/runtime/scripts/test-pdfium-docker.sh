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
WORKSPACE="$(cd "$ROOT/../../.." && pwd)"  # the monorepo root (oss/embedpdf): ROOT is packages/engine/runtime

CONTAINER_SRC="/workspace/packages/engine/runtime/runtime-src"

# The host's runtime-src is usually synced for macOS, so the container swaps in
# Linux builds of the host tools the sync pins:
# - clang: the package runtime-src/tools/clang/scripts/update.py pins, in a
#   volume per package version, so a clang roll gets a fresh volume and leaves
#   the previous toolchain intact.
# - python: //.gn runs gn's scripts with //third_party/cpython3/host. DEPS also
#   fetches the same cpython3_version for linux-amd64 on every host, which is
#   mounted in its place.
CLANG_SCRIPTS="$ROOT/runtime-src/tools/clang/scripts"
LINUX_PYTHON_DIR="$ROOT/runtime-src/third_party/cpython3/linux-amd64"
for dep in "$CLANG_SCRIPTS/update.py" "$LINUX_PYTHON_DIR/bin/python3"; do
  if [[ ! -e "$dep" ]]; then
    echo "missing ${dep#"$ROOT/"}; sync runtime-src dependencies first (PDF_RUNTIME_SYNC=auto bash scripts/test-pdfium.sh)" >&2
    exit 1
  fi
done
CLANG_PACKAGE_VERSION="$(python3 -B -c 'import sys; sys.path.insert(0, sys.argv[1]); import update; print(update.PACKAGE_VERSION)' "$CLANG_SCRIPTS")"
LINUX_CLANG_RELEASE_VERSION="$(python3 "$CLANG_SCRIPTS/update.py" --print-clang-version)"
LINUX_CLANG_VOLUME="pdf-runtime_linux-llvm-build-$CLANG_PACKAGE_VERSION"
LINUX_CLANG_DIR="$CONTAINER_SRC/third_party/llvm-build/Release+Asserts"
LINUX_CLANG_URL="https://commondatastorage.googleapis.com/chromium-browser-clang/Linux_x64/clang-$CLANG_PACKAGE_VERSION.tar.xz"

# The linux-test stage bakes Chromium's Linux build deps into the image from
# runtime-src/build. Before the first dependency sync that script doesn't exist
# yet; build the base stage and let test-target.sh install them in the container.
image_target="linux-test"
if [[ ! -f "$ROOT/runtime-src/build/install-build-deps.py" ]]; then
  echo "note: runtime-src/build is not synced; Linux build deps will be installed in the container" >&2
  image_target="base"
fi

echo "=== building pdf-runtime-linux-test image ==="
docker build \
  --progress=plain \
  --target "$image_target" \
  -t "$image_name" \
  -f "$ROOT/Dockerfile" \
  "$ROOT"

echo "=== running pdf-runtime-linux-test ==="
docker run --rm \
  --platform linux/amd64 \
  -v "$WORKSPACE:/workspace" \
  -v pdf-runtime_pdf-runtime-gclient:/root/.cache \
  -v "$LINUX_CLANG_VOLUME:$LINUX_CLANG_DIR" \
  -v "$LINUX_PYTHON_DIR:$CONTAINER_SRC/third_party/cpython3/host:ro" \
  -w /workspace/packages/engine/runtime \
  -e PDF_RUNTIME_SYNC \
  -e PDF_RUNTIME_TARGET_OS_LIST=linux \
  -e PDFIUM_TEST_SUITE \
  -e PDFIUM_UNIT_FILTER \
  -e PDFIUM_EMBEDDER_FILTER \
  -e PDFIUM_GTEST_ARGS \
  -e LINUX_CLANG_DIR="$LINUX_CLANG_DIR" \
  -e LINUX_CLANG_URL="$LINUX_CLANG_URL" \
  -e LINUX_CLANG_RELEASE_VERSION="$LINUX_CLANG_RELEASE_VERSION" \
  "$image_name" \
  bash -lc '
    set -euo pipefail
    if [[ ! -f "$LINUX_CLANG_DIR/lib/clang/$LINUX_CLANG_RELEASE_VERSION/lib/x86_64-unknown-linux-gnu/libclang_rt.builtins.a" ]]; then
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

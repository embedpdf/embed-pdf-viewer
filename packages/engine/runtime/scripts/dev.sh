#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/dev.sh"
SRC="$ROOT/runtime-src"
EMSDK_VERSION="3.1.72"
LOCK_DIR="$ROOT/.cache/dev"
RUNNING="$LOCK_DIR/running"
PENDING="$LOCK_DIR/pending"

mkdir -p "$LOCK_DIR"

if [[ ! -d "$SRC/.git" && ! -f "$SRC/.git" ]]; then
  echo "runtime-src missing; run: git submodule update --init --recursive packages/pdf-runtime/runtime-src" >&2
  exit 1
fi

for cmd in gn ninja gclient cmake; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    case "$cmd" in
      cmake) echo "missing cmake on PATH; install with: brew install cmake (Mac) or apt-get install cmake (Linux)" >&2 ;;
      *) echo "missing $cmd on PATH; install depot_tools and add it to PATH" >&2 ;;
    esac
    exit 1
  fi
done

case "$(uname -s)" in
  Darwin)
    case "$(uname -m)" in
      arm64)  HOST_TARGET="darwin-arm64" ;;
      x86_64) HOST_TARGET="darwin-x64" ;;
      *) echo "unsupported Darwin arch: $(uname -m)" >&2; exit 1 ;;
    esac
    export PDF_RUNTIME_TARGET_OS_LIST="mac emscripten"
    ;;
  Linux)
    case "$(uname -m)" in
      aarch64|arm64) HOST_TARGET="linux-arm64" ;;
      x86_64)        HOST_TARGET="linux-x64" ;;
      *) echo "unsupported Linux arch: $(uname -m)" >&2; exit 1 ;;
    esac
    export PDF_RUNTIME_TARGET_OS_LIST="linux emscripten"
    echo "note: first-time linux-* native build will run install-build-deps.sh and install-sysroot.py via sudo" >&2
    ;;
  *) echo "dev only supports Darwin or Linux hosts" >&2; exit 1 ;;
esac

if [[ -n "${PDF_RUNTIME_DEV_TARGETS:-}" ]]; then
  read -r -a TARGETS <<< "$PDF_RUNTIME_DEV_TARGETS"
else
  TARGETS=("wasm32" "$HOST_TARGET")
fi

ensure_emsdk() {
  local emsdk_dir="$SRC/third_party/emsdk"
  if [[ ! -d "$emsdk_dir/.git" ]]; then
    git clone https://github.com/emscripten-core/emsdk.git "$emsdk_dir"
  fi
  "$emsdk_dir/emsdk" install "$EMSDK_VERSION"
  "$emsdk_dir/emsdk" activate "$EMSDK_VERSION"
  # shellcheck disable=SC1091
  source "$emsdk_dir/emsdk_env.sh"
}

build_one_target() {
  local target="$1"
  echo "=== building $target ==="
  PDF_RUNTIME_SYNC="${PDF_RUNTIME_SYNC:-local}" \
    "$SRC/scripts/embedpdf-runtime/build-target.sh" "$target"
  local artifact
  artifact="$("$SRC/scripts/embedpdf-runtime/package-target.sh" "$target" | tail -n1)"
  "$ROOT/scripts/runtime-use-local.sh" "$target" "$artifact"
  PDF_RUNTIME_BUILD_FILE="$ROOT/engine-runtime-build.local.json" \
    "$ROOT/scripts/build-target.sh" "$target"
}

build_once() {
  if [[ " ${TARGETS[*]} " == *" wasm32 "* ]]; then
    ensure_emsdk
  fi
  for target in "${TARGETS[@]}"; do
    build_one_target "$target"
  done
  echo "pdf-runtime refreshed: ${TARGETS[*]}"
}

if [[ "${PDF_RUNTIME_DEV_BUILD_ONCE:-}" == "1" ]]; then
  if [[ -f "$RUNNING" ]]; then
    touch "$PENDING"
    echo "build already running; queued rebuild"
    exit 0
  fi
  trap 'rm -f "$RUNNING"' EXIT
  while :; do
    touch "$RUNNING"
    rm -f "$PENDING"
    build_once
    [[ -f "$PENDING" ]] || break
    echo "rebuild requested while building; running again"
  done
  exit 0
fi

CHOKIDAR_BIN="$ROOT/node_modules/.bin/chokidar"
if [[ ! -x "$CHOKIDAR_BIN" ]]; then
  echo "chokidar binary missing at $CHOKIDAR_BIN; run: pnpm install --filter @embedpdf/pdf-runtime" >&2
  exit 1
fi

cd "$SRC"
exec "$CHOKIDAR_BIN" \
  "core/**/*.{cc,cpp,h}" \
  "fpdfsdk/**/*.{cc,cpp,h}" \
  "fxbarcode/**/*.{cc,cpp,h}" \
  "fxjs/**/*.{cc,cpp,h}" \
  "xfa/**/*.{cc,cpp,h}" \
  "public/**/*.h" \
  "constants/**/*.h" \
  --initial \
  --debounce 2000 \
  -c "PDF_RUNTIME_DEV_BUILD_ONCE=1 bash '$SCRIPT'"

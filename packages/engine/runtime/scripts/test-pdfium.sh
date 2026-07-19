#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/runtime-src"
TEST_SUITE="${PDFIUM_TEST_SUITE:-all}"

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
    export PDF_RUNTIME_TARGET_OS_LIST="${PDF_RUNTIME_TARGET_OS_LIST:-mac}"
    ;;
  Linux)
    case "$(uname -m)" in
      aarch64|arm64) HOST_TARGET="linux-arm64" ;;
      x86_64)        HOST_TARGET="linux-x64" ;;
      *) echo "unsupported Linux arch: $(uname -m)" >&2; exit 1 ;;
    esac
    export PDF_RUNTIME_TARGET_OS_LIST="${PDF_RUNTIME_TARGET_OS_LIST:-linux}"
    echo "note: first-time linux-* test build will run install-build-deps.sh and install-sysroot.py via sudo" >&2
    ;;
  *)
    echo "test-pdfium only supports Darwin or Linux hosts" >&2
    exit 1
    ;;
esac

PDFIUM_TEST_SUITE="$TEST_SUITE" \
  PDF_RUNTIME_SYNC="${PDF_RUNTIME_SYNC:-local}" \
  "$SRC/scripts/embedpdf-runtime/test-target.sh" "$HOST_TARGET"

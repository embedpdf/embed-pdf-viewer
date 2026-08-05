#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

targets=()
case "$(uname -s)" in
  Darwin)
    targets+=(darwin-arm64 darwin-x64 wasm32)
    ;;
  Linux)
    arch="$(uname -m)"
    if [[ "$arch" == "aarch64" || "$arch" == "arm64" ]]; then
      targets+=(linux-arm64 linuxmusl-arm64 wasm32)
    else
      targets+=(linux-x64 linuxmusl-x64 wasm32)
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    targets+=(win32-x64 win32-arm64)
    ;;
  *)
    targets+=(wasm32)
    ;;
esac

for target in "${targets[@]}"; do
  echo "Building $target"
  "$ROOT/scripts/build-target.sh" "$target"
done

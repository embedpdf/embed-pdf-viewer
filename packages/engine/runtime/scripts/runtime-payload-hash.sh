#!/usr/bin/env bash
# The canonical identity of a finished runtime payload: a hash over every
# input that determines the compiled sidecar contents. The C++ fork work is
# captured via engine-runtime-build.json (the runtime pin — the fork's CI
# bakes EPDF_* into libembedpdf.a); the rest is this repo's generators and
# compile scripts.
#
# Used by build-engine-runtime.yml to name the `runtime-payloads-<hash>`
# release it publishes, and by fetch-payload.sh to derive which release a
# checkout needs. KEEP THE FILE LIST IN SYNC with the actions/cache key in
# .github/workflows/build-engine-runtime.yml.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

INPUTS=(
  "engine-runtime-build.json"
  "scripts/build-target.sh"
  "scripts/fetch-libpdfium.sh"
  "build/generate-functions.mjs"
  "build/generate-runtime-methods.mjs"
  "build/generate-napi-binding.mjs"
  "build/CMakeLists.txt"
  "build/compile.sh"
  "build/compile.esm.sh"
)

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

ACC=""
for rel in "${INPUTS[@]}"; do
  f="$ROOT/$rel"
  if [[ -f "$f" ]]; then
    ACC+="$rel:$(sha256_file "$f")\n"
  else
    # Missing inputs contribute deterministically (mirrors hashFiles semantics).
    ACC+="$rel:-\n"
  fi
done

if command -v sha256sum >/dev/null 2>&1; then
  printf '%b' "$ACC" | sha256sum | awk '{print substr($1, 1, 16)}'
else
  printf '%b' "$ACC" | shasum -a 256 | awk '{print substr($1, 1, 16)}'
fi

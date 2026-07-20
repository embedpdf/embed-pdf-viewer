#!/usr/bin/env bash
# Hydrate finished runtime payloads (npm/<target>/lib) from the repo's
# content-addressed `runtime-payloads-<hash>` GitHub releases — so Vercel
# previews, fresh clones, and CI get a working engine without emscripten or
# cmake toolchains. The hash is DERIVED from the checkout (see
# runtime-payload-hash.sh), so every environment fetches exactly the payload
# its sources correspond to.
#
#   usage: fetch-payload.sh [target ...]        (default: wasm32)
#   env:   EPDF_PAYLOAD_WAIT_MINUTES=<n>  poll for the release to appear
#          (for CI racing the runtime build on runtime-touching branches)
#          EPDF_PAYLOAD_REPO=owner/repo   override the release source repo
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${EPDF_PAYLOAD_REPO:-embedpdf/runtime-payloads}"
WAIT_MINUTES="${EPDF_PAYLOAD_WAIT_MINUTES:-0}"
TARGETS=("${@:-wasm32}")

HASH="$(bash "$ROOT/scripts/runtime-payload-hash.sh")"
BASE_URL="https://github.com/$REPO/releases/download/runtime-payloads-$HASH"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

wait_for_asset() {
  local url="$1" deadline
  deadline=$(($(date +%s) + WAIT_MINUTES * 60))
  while true; do
    if curl -sfIL "$url" >/dev/null 2>&1; then
      return 0
    fi
    if (($(date +%s) >= deadline)); then
      return 1
    fi
    echo "  payload not published yet — waiting (runtime build in flight?)…"
    sleep 15
  done
}

for TARGET in "${TARGETS[@]}"; do
  LIB_DIR="$ROOT/npm/$TARGET/lib"
  MARKER="$LIB_DIR/.payload-source"

  if [[ -d "$LIB_DIR" ]] && [[ -n "$(ls -A "$LIB_DIR" 2>/dev/null | grep -v '^\.payload-source$' || true)" ]]; then
    if [[ ! -f "$MARKER" ]]; then
      echo "✓ $TARGET: locally built payload present — leaving it untouched"
      continue
    fi
    if [[ "$(cat "$MARKER")" == "$HASH" ]]; then
      echo "✓ $TARGET: payload $HASH already present"
      continue
    fi
    echo "· $TARGET: payload is $(cat "$MARKER"), need $HASH — refetching"
  fi

  ASSET="engine-runtime-payload-$TARGET.tar.gz"
  URL="$BASE_URL/$ASSET"

  if ! curl -sfIL "$URL" >/dev/null 2>&1; then
    if ((WAIT_MINUTES > 0)); then
      echo "· $TARGET: waiting up to ${WAIT_MINUTES}m for $URL"
      if ! wait_for_asset "$URL"; then
        echo "✖ $TARGET: runtime-payloads-$HASH not published within ${WAIT_MINUTES}m." >&2
        echo "  If this branch changed the runtime, the build workflow publishes it —" >&2
        echo "  check the Build PDF Runtime run, then redeploy." >&2
        exit 1
      fi
    else
      echo "✖ $TARGET: no published payload for runtime state $HASH ($URL)." >&2
      echo "  Either wait for the Build PDF Runtime workflow, build locally" >&2
      echo "  (pnpm --filter @embedpdf/engine-runtime build:target $TARGET)," >&2
      echo "  or set EPDF_PAYLOAD_WAIT_MINUTES to poll." >&2
      exit 1
    fi
  fi

  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  echo "· $TARGET: downloading $URL"
  curl -sfL "$URL" -o "$TMP/$ASSET"
  if curl -sfL "$URL.sha256" -o "$TMP/$ASSET.sha256" 2>/dev/null; then
    EXPECTED="$(awk '{print $1}' "$TMP/$ASSET.sha256")"
    ACTUAL="$(sha256_file "$TMP/$ASSET")"
    if [[ "$EXPECTED" != "$ACTUAL" ]]; then
      echo "✖ $TARGET: checksum mismatch (expected $EXPECTED, got $ACTUAL)" >&2
      exit 1
    fi
  fi

  rm -rf "$LIB_DIR"
  mkdir -p "$LIB_DIR"
  tar -xzf "$TMP/$ASSET" -C "$LIB_DIR"
  printf '%s' "$HASH" > "$MARKER"
  rm -rf "$TMP"
  trap - EXIT
  echo "✓ $TARGET: hydrated payload $HASH"
done

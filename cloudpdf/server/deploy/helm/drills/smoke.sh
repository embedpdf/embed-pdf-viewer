#!/usr/bin/env bash
# CloudPDF Helm smoke: fresh kind cluster -> empty-namespace install
# (default profile) -> readiness -> helm test -> config-change upgrade
# -> crash/restart drill -> teardown.
#
# Requires: docker, kind, helm, kubectl on PATH.
#
# Env:
#   CLOUDPDF_LICENSE_KEY   Full smoke (boot, test, upgrade, crash drill).
#                          WITHOUT it the server fail-closes at boot (by
#                          design), so the smoke degrades to asserting
#                          chart mechanics + the fail-closed boundary.
#   CLOUDPDF_IMAGE_TAG     Image tag to run (default: next).
#   KEEP=1                 Keep the kind cluster after the run.
set -euo pipefail

CLUSTER="${CLUSTER:-cloudpdf-smoke}"
NS=cloudpdf-smoke
TAG="${CLOUDPDF_IMAGE_TAG:-next}"
CHART_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../cloudpdf-server" && pwd)"
RELEASE=cloudpdf

log() { printf '\n== %s\n' "$*"; }

# Pre-load the server image from the host's docker cache into the kind
# cluster — each kind cluster has an isolated image store, so without
# this every fresh cluster re-pulls ~1GB from GHCR (3-4 min). Best
# effort: on failure the cluster pulls normally.
preload_image() {
  local img="ghcr.io/embedpdf/cloudpdf-server:$TAG"
  docker pull "$img" >/dev/null 2>&1 || return 0
  kind load docker-image "$img" --name "$CLUSTER" >/dev/null 2>&1 || true
}


# Abrupt-kill one pod's server process from the kind node. Inside a
# container, pid 1 only receives signals it has handlers for — a
# SIGSEGV sent to pid 1 is silently discarded by the kernel (this is
# also why the Docker docs recommend --init, which demotes node off
# pid 1). SIGKILL from the node's namespace is the reliable abrupt
# death; to the supervisor it is indistinguishable from a native
# crash. crictl scoping targets exactly one pod, never its siblings.
kill_pod_process() { # <pod-name>
  local node podid cid pid
  node=$(kind get nodes --name "$CLUSTER" | head -1)
  podid=$(docker exec "$node" crictl pods -q --name "$1")
  cid=$(docker exec "$node" crictl ps -q --pod "$podid" | head -1)
  pid=$(docker exec "$node" crictl inspect -o go-template --template '{{.info.pid}}' "$cid")
  docker exec "$node" kill -9 "$pid"
}


log "kind cluster ($CLUSTER)"
kind get clusters 2>/dev/null | grep -qx "$CLUSTER" || kind create cluster --name "$CLUSTER" --wait 120s
preload_image
if [[ "${KEEP:-0}" != "1" ]]; then
  trap 'kind delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true' EXIT
fi

# Production-grade keys enforce secret hygiene on ALL three server
# secrets (JWT + the two password-session HMACs) — set them all so the
# smoke works with any key kind.
SECRET_ARGS=(
  --set "secrets.CLOUDPDF_JWT_SECRET=$(openssl rand -hex 32)"
  --set "secrets.CLOUDPDF_PASSWORD_VERIFICATION_HMAC_SECRET=$(openssl rand -hex 32)"
  --set "secrets.CLOUDPDF_PASSWORD_SESSION_SERVER_SECRET=$(openssl rand -hex 32)"
)
if [[ -n "${CLOUDPDF_LICENSE_KEY:-}" ]]; then
  SECRET_ARGS+=(--set "secrets.CLOUDPDF_LICENSE_KEY=${CLOUDPDF_LICENSE_KEY}")
fi

if [[ -n "${CLOUDPDF_LICENSE_KEY:-}" ]]; then
  log "install (default profile, empty namespace, licensed)"
  helm install "$RELEASE" "$CHART_DIR" -n "$NS" --create-namespace \
    --set image.tag="$TAG" "${SECRET_ARGS[@]}" --wait --timeout 5m

  log "helm test"
  helm test "$RELEASE" -n "$NS"

  log "config-change upgrade (checksum annotation must roll the pod)"
  GEN_BEFORE=$(kubectl -n "$NS" get deploy "$RELEASE-cloudpdf-server" -o jsonpath='{.metadata.generation}')
  helm upgrade "$RELEASE" "$CHART_DIR" -n "$NS" --reuse-values \
    --set config.LOG_LEVEL=info --wait --timeout 5m
  GEN_AFTER=$(kubectl -n "$NS" get deploy "$RELEASE-cloudpdf-server" -o jsonpath='{.metadata.generation}')
  [[ "$GEN_AFTER" -gt "$GEN_BEFORE" ]] || { echo "upgrade did not roll the deployment"; exit 1; }

  log "crash drill: abrupt process kill (supervision-equivalent to a native crash)"
  POD=$(kubectl -n "$NS" get pod -l "app.kubernetes.io/instance=$RELEASE" -o jsonpath='{.items[0].metadata.name}')
  T0=$(date +%s)
  kill_pod_process "$POD"
  sleep 3
  kubectl -n "$NS" wait --for=condition=ready "pod/$POD" --timeout=120s
  T1=$(date +%s)
  RESTARTS=$(kubectl -n "$NS" get pod "$POD" -o jsonpath='{.status.containerStatuses[0].restartCount}')
  [[ "$RESTARTS" -ge 1 ]] || { echo "expected a container restart after SIGSEGV"; exit 1; }
  log "SMOKE OK — crash -> ready again in $((T1 - T0))s (restartCount=$RESTARTS)"
else
  log "install (no CLOUDPDF_LICENSE_KEY: asserting chart mechanics + the fail-closed license boundary)"
  helm install "$RELEASE" "$CHART_DIR" -n "$NS" --create-namespace \
    --set image.tag="$TAG" "${SECRET_ARGS[@]}" --wait=false

  log "waiting for the pod to prove fail-closed boot (exit code 2, license message)"
  for _ in $(seq 1 60); do
    POD=$(kubectl -n "$NS" get pod -l "app.kubernetes.io/instance=$RELEASE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
    [[ -n "$POD" ]] || { sleep 2; continue; }
    EXIT_CODE=$(kubectl -n "$NS" get pod "$POD" -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}' 2>/dev/null || true)
    [[ "$EXIT_CODE" == "2" ]] && break
    sleep 2
  done
  [[ "${EXIT_CODE:-}" == "2" ]] || { echo "expected fail-closed exit code 2"; kubectl -n "$NS" get pods; exit 1; }
  MSG_OK=0
  for _ in $(seq 1 10); do
    LOGS=$(kubectl -n "$NS" logs "$POD" --previous 2>/dev/null || kubectl -n "$NS" logs "$POD" 2>/dev/null || true)
    if printf '%s' "$LOGS" | grep -qiE 'certificate|license'; then MSG_OK=1; break; fi
    sleep 2
  done
  [[ "$MSG_OK" == "1" ]] || {
    echo "expected a license message in logs"
    kubectl -n "$NS" logs "$POD" --previous 2>/dev/null | tail -20 || true
    exit 1
  }
  log "SMOKE (license-boundary mode) OK — image pulled, chart rendered, secrets/env wired, boot fail-closed as designed."
  log "Re-run with CLOUDPDF_LICENSE_KEY=... for the full drill."
fi

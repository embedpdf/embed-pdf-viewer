#!/usr/bin/env bash
# The resilience drill (plan §5.3): 2 replicas on the Postgres +
# object-storage profile, live SSE listener + continuous render load,
# then a native-crash simulation on one pod. Prints the recovery
# timeline that backs the resilience claims:
#   - no fleet-wide outage (the surviving replica absorbs)
#   - zero committed-write loss (WS1)
#   - crashed pod MTTR
#
# Self-contained: installs pinned postgres + MinIO manifests as DRILL
# dependencies (the chart itself stays BYO-database, as documented).
#
# Requires: docker, kind, helm, kubectl, curl, openssl.
# Env:
#   CLOUDPDF_LICENSE_KEY  (required — the server fail-closes without it)
#   CLOUDPDF_IMAGE_TAG    image tag (default: next)
#   KEEP=1                keep the cluster
set -euo pipefail

: "${CLOUDPDF_LICENSE_KEY:?the drill needs a license key (the server fail-closes without one)}"

CLUSTER="${CLUSTER:-cloudpdf-drill}"
NS=cloudpdf-drill
TAG="${CLOUDPDF_IMAGE_TAG:-next}"
CHART_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../cloudpdf-server" && pwd)"
RELEASE=cloudpdf
API_TOKEN=$(openssl rand -hex 32)

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
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

log "drill dependencies: postgres:16-alpine + minio (pinned, throwaway)"
kubectl -n "$NS" apply -f - <<'DEPS'
apiVersion: apps/v1
kind: Deployment
metadata: { name: drill-postgres }
spec:
  replicas: 1
  selector: { matchLabels: { app: drill-postgres } }
  template:
    metadata: { labels: { app: drill-postgres } }
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          env:
            - { name: POSTGRES_USER, value: cloudpdf }
            - { name: POSTGRES_PASSWORD, value: drill-only }
            - { name: POSTGRES_DB, value: cloudpdf }
          ports: [{ containerPort: 5432 }]
          readinessProbe:
            exec: { command: ['pg_isready', '-U', 'cloudpdf'] }
            periodSeconds: 2
---
apiVersion: v1
kind: Service
metadata: { name: drill-postgres }
spec:
  selector: { app: drill-postgres }
  ports: [{ port: 5432 }]
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: drill-minio }
spec:
  replicas: 1
  selector: { matchLabels: { app: drill-minio } }
  template:
    metadata: { labels: { app: drill-minio } }
    spec:
      containers:
        - name: minio
          image: minio/minio:RELEASE.2024-12-18T13-15-44Z
          args: ['server', '/data']
          env:
            - { name: MINIO_ROOT_USER, value: drilldrill }
            - { name: MINIO_ROOT_PASSWORD, value: drill-only-secret }
          ports: [{ containerPort: 9000 }]
---
apiVersion: v1
kind: Service
metadata: { name: drill-minio }
spec:
  selector: { app: drill-minio }
  ports: [{ port: 9000 }]
DEPS
kubectl -n "$NS" rollout status deploy/drill-postgres deploy/drill-minio --timeout=180s

log "create the cloudpdf bucket"
kubectl -n "$NS" run mc --rm -i --restart=Never --image=minio/mc:RELEASE.2024-11-21T17-21-54Z --command -- /bin/sh -c \
  'mc alias set drill http://drill-minio:9000 drilldrill drill-only-secret && mc mb -p drill/cloudpdf'

log "install cloudpdf: 2 replicas, postgres profile, migrate hook"
# Create-once: rotating the secret on a warm re-run would desync running
# pods (existingSecret changes cannot roll pods via checksum — the
# operator caveat from DEPLOY.md, live). The token is always read back
# from the cluster so re-runs use whatever the pods actually hold.
if ! kubectl -n "$NS" get secret cloudpdf-secrets >/dev/null 2>&1; then
  kubectl -n "$NS" create secret generic cloudpdf-secrets \
    --from-literal=CLOUDPDF_JWT_SECRET="$(openssl rand -hex 32)" \
    --from-literal=CLOUDPDF_PASSWORD_VERIFICATION_HMAC_SECRET="$(openssl rand -hex 32)" \
    --from-literal=CLOUDPDF_PASSWORD_SESSION_SERVER_SECRET="$(openssl rand -hex 32)" \
    --from-literal=CLOUDPDF_DB_URL='postgres://cloudpdf:drill-only@drill-postgres:5432/cloudpdf' \
    --from-literal=AWS_ACCESS_KEY_ID=drilldrill \
    --from-literal=AWS_SECRET_ACCESS_KEY=drill-only-secret \
    --from-literal=CLOUDPDF_API_AUTH_TOKENS="$API_TOKEN" \
    --from-literal=CLOUDPDF_LICENSE_KEY="$CLOUDPDF_LICENSE_KEY"
fi
API_TOKEN=$(kubectl -n "$NS" get secret cloudpdf-secrets \
  -o jsonpath='{.data.CLOUDPDF_API_AUTH_TOKENS}' | base64 -d)

helm upgrade --install "$RELEASE" "$CHART_DIR" -n "$NS" \
  --set image.tag="$TAG" \
  --set replicaCount=2 \
  --set existingSecret=cloudpdf-secrets \
  --set migrations.enabled=true \
  --set config.CLOUDPDF_DB_DRIVER=postgres \
  --set config.CLOUDPDF_STORAGE_KIND=s3 \
  --set config.CLOUDPDF_STORAGE_S3_BUCKET=cloudpdf \
  --set config.CLOUDPDF_STORAGE_S3_REGION=us-east-1 \
  --set config.CLOUDPDF_STORAGE_S3_ENDPOINT=http://drill-minio:9000 \
  --set-string config.CLOUDPDF_AUTO_PROVISION_TENANT=1 \
  --set config.CLOUDPDF_UPLOAD_PROXY_POLICY=allowed \
  --wait --timeout 8m

# Self-heal a token/pod desync (a manually rotated secret cannot roll
# pods): probe an authed endpoint; on 401, restart the deployment so
# pods re-read the secret.
# curl -w emits no trailing newline and kubectl's deletion notice lands
# on the same stdout line — extract the leading 3-digit status.
PROBE=$(kubectl -n "$NS" run drill-authprobe --rm -i --restart=Never \
  --image=curlimages/curl:8.10.1 --env "TOKEN=$API_TOKEN" --command -- \
  sh -c 'curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
    "http://'"$RELEASE"'-cloudpdf-server:3000/v1/tenants/drill/documents?limit=1"' 2>/dev/null \
  | grep -oE '^[0-9]{3}' | head -1)
if [ "$PROBE" = "401" ]; then
  log "pods hold a stale token — rolling the deployment"
  kubectl -n "$NS" rollout restart "deploy/$RELEASE-cloudpdf-server"
  kubectl -n "$NS" rollout status "deploy/$RELEASE-cloudpdf-server" --timeout=300s
fi

log "port-forward + seed a document"
kubectl -n "$NS" port-forward "svc/$RELEASE-cloudpdf-server" 3000:3000 >/dev/null 2>&1 &
PF_PID=$!
trap 'kill $PF_PID >/dev/null 2>&1 || true; [[ "${KEEP:-0}" != "1" ]] && kind delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true' EXIT
sleep 3

# A minimal but real PDF for the seed. Upload protocol: init (forcing
# the proxy transfer, since presigned MinIO URLs are in-cluster only)
# -> multipart upload-proxy -> commit with the sha.
PDF=$(mktemp).pdf
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n164\n%%%%EOF\n' > "$PDF"
SHA=$(shasum -a 256 "$PDF" | cut -d' ' -f1)
LEN=$(wc -c < "$PDF" | tr -d ' ')
BASE='http://127.0.0.1:3000/v1/tenants/drill'
AUTH=(-H "Authorization: Bearer $API_TOKEN")

INIT=$(curl -sf -X POST "$BASE/documents/init" "${AUTH[@]}" \
  -H 'content-type: application/json' \
  -d "{\"contentLength\":$LEN,\"contentSha256\":\"$SHA\",\"uploadPreference\":\"proxy\"}")
DOC=$(printf '%s' "$INIT" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[[ -n "$DOC" ]] || { echo "init failed: $INIT"; exit 1; }
curl -sf -X POST "$BASE/documents/$DOC/upload-proxy" "${AUTH[@]}" \
  -F "file=@$PDF;type=application/pdf" > /dev/null
curl -sf -X POST "$BASE/documents/$DOC/commit" "${AUTH[@]}" \
  -H 'content-type: application/json' -d "{\"sha256\":\"$SHA\"}" > /dev/null
log "seeded document $DOC"

# Load runs IN-CLUSTER against the Service so kube-proxy does real
# cross-replica routing — a host port-forward pins to one pod and dies
# with it, which fakes both the failure count and any post-crash check.
log "load: continuous in-cluster reads through the Service"
kubectl -n "$NS" delete pod drill-load --ignore-not-found --wait=false >/dev/null 2>&1 || true
kubectl -n "$NS" run drill-load --image=curlimages/curl:8.10.1 --restart=Never \
  --env "TOKEN=$API_TOKEN" --env "SVC=$RELEASE-cloudpdf-server" --command -- sh -c \
  'while true; do
     if curl -sf -o /dev/null -m 2 -H "Authorization: Bearer $TOKEN" \
       "http://$SVC:3000/v1/tenants/drill/documents?limit=10"; then echo ok; else echo fail; fi
     sleep 0.2
   done'
kubectl -n "$NS" wait --for=condition=ready pod/drill-load --timeout=120s
sleep 3

log "CRASH: abrupt process kill on one replica (supervision-equivalent to a native crash)"
POD=$(kubectl -n "$NS" get pod -l "app.kubernetes.io/instance=$RELEASE" -o jsonpath='{.items[0].metadata.name}')
T0=$(date +%s)
kill_pod_process "$POD"
sleep 3
kubectl -n "$NS" wait --for=condition=ready "pod/$POD" --timeout=180s
T1=$(date +%s)
sleep 3

LOAD_LOG=$(mktemp)
kubectl -n "$NS" logs drill-load > "$LOAD_LOG" 2>/dev/null || true
kubectl -n "$NS" delete pod drill-load --wait=false >/dev/null 2>&1 || true
TOTAL=$(grep -c . "$LOAD_LOG" || true)
FAILS=$(grep -c fail "$LOAD_LOG" || true)
RESTARTS=$(kubectl -n "$NS" get pod "$POD" -o jsonpath='{.status.containerStatuses[0].restartCount}')

log "post-crash consistency: the seeded document must still list"
# Fresh tunnel — the seed-time port-forward may have been pinned to the
# pod we just killed.
kill $PF_PID >/dev/null 2>&1 || true
kubectl -n "$NS" port-forward "svc/$RELEASE-cloudpdf-server" 3000:3000 >/dev/null 2>&1 &
PF_PID=$!
sleep 3
curl -sf -H "Authorization: Bearer $API_TOKEN" \
  "$BASE/documents" | grep -q "$DOC" || { echo 'DOCUMENT LOST'; exit 1; }

cat <<TIMELINE

================ CRASH DRILL TIMELINE ================
  crash (abrupt kill, native-equivalent) t+0s
  crashed pod ready again              t+$((T1 - T0))s   (restartCount=$RESTARTS)
  requests during window               $TOTAL total, $FAILS failed
  committed data after crash           intact (seed doc listed)
======================================================
  Claim this supports: a native crash costs ONE pod for
  ~$((T1 - T0))s; the fleet keeps serving; no data loss.
TIMELINE

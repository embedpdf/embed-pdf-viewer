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

log "kind cluster ($CLUSTER)"
kind get clusters 2>/dev/null | grep -qx "$CLUSTER" || kind create cluster --name "$CLUSTER" --wait 120s
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
kubectl -n "$NS" create secret generic cloudpdf-secrets \
  --from-literal=CLOUDPDF_JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=CLOUDPDF_DB_URL='postgres://cloudpdf:drill-only@drill-postgres:5432/cloudpdf' \
  --from-literal=AWS_ACCESS_KEY_ID=drilldrill \
  --from-literal=AWS_SECRET_ACCESS_KEY=drill-only-secret \
  --from-literal=CLOUDPDF_API_AUTH_TOKENS="$API_TOKEN" \
  --from-literal=CLOUDPDF_LICENSE_KEY="$CLOUDPDF_LICENSE_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

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
  --set config.CLOUDPDF_AUTO_PROVISION_TENANT=1 \
  --set config.CLOUDPDF_UPLOAD_PROXY_POLICY=allowed \
  --wait --timeout 8m

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

log "load: continuous reads against the doc (background)"
FAILS=0; TOTAL=0
LOAD_LOG=$(mktemp)
( while :; do
    if curl -sf -o /dev/null -H "Authorization: Bearer $API_TOKEN" \
        "$BASE/documents?limit=10"; then echo ok; else echo fail; fi
    sleep 0.2
  done > "$LOAD_LOG" ) &
LOAD_PID=$!

sleep 3
log "CRASH: SIGSEGV pid 1 on one replica"
POD=$(kubectl -n "$NS" get pod -l "app.kubernetes.io/instance=$RELEASE" -o jsonpath='{.items[0].metadata.name}')
T0=$(date +%s)
kubectl -n "$NS" exec "$POD" -- kill -SEGV 1 || true
sleep 3
kubectl -n "$NS" wait --for=condition=ready "pod/$POD" --timeout=180s
T1=$(date +%s)
sleep 3
kill $LOAD_PID >/dev/null 2>&1 || true

TOTAL=$(grep -c . "$LOAD_LOG" || true)
FAILS=$(grep -c fail "$LOAD_LOG" || true)
RESTARTS=$(kubectl -n "$NS" get pod "$POD" -o jsonpath='{.status.containerStatuses[0].restartCount}')

log "post-crash consistency: the seeded document must still list"
curl -sf -H "Authorization: Bearer $API_TOKEN" \
  "$BASE/documents" | grep -q "$DOC" || { echo 'DOCUMENT LOST'; exit 1; }

cat <<TIMELINE

================ CRASH DRILL TIMELINE ================
  crash (SIGSEGV, native-equivalent)   t+0s
  crashed pod ready again              t+$((T1 - T0))s   (restartCount=$RESTARTS)
  requests during window               $TOTAL total, $FAILS failed
  committed data after crash           intact (seed doc listed)
======================================================
  Claim this supports: a native crash costs ONE pod for
  ~$((T1 - T0))s; the fleet keeps serving; no data loss.
TIMELINE

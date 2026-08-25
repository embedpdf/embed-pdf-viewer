# CloudPDF server — Kubernetes operator reference

The narrative install guide lives on the docs site
([Deployment → Helm / Kubernetes](https://www.cloudpdf.com/docs/server/deployment/helm)).
This file is the deep operator reference behind it: version doctrine, the
chart's safety gates, shutdown/drain semantics, load-balancer recipes,
network policy realities, and sizing.

## Artifacts & versions

- Image: `ghcr.io/embedpdf/cloudpdf-server` (multi-arch amd64+arm64, public).
- Chart: `oci://ghcr.io/embedpdf/charts/cloudpdf-server`.
- One version across npm, image, and chart — the release workflow stamps
  the chart's `version` and `appVersion` from `cloudpdf/server/package.json`.
  `-next.N` versions are Helm prereleases: a bare `helm install` never
  picks them; pin `--version` explicitly on the `next` channel.
- Production doctrine (`DOCKER.md`): promote by digest. `image.digest`
  overrides `image.tag`; pin the digest you tested.

## Profiles & safety gates

Two supported shapes, enforced at render time (`_helpers.tpl`,
`cloudpdf-server.validate`):

| Profile | DB / storage | Replicas | Migrations |
| --- | --- | --- | --- |
| Small footprint | sqlite + fs on a PVC (`persistence.enabled`) | exactly 1, `Recreate` | at boot (`CLOUDPDF_AUTO_MIGRATE=1`) |
| Production | postgres + s3/gcs/azure-blob | 1..N + HPA | pre-upgrade hook Job (`migrations.enabled`) |

The gates fail `helm install`/`upgrade`/`template` on: scaling with
sqlite/fs, scaling with a PVC, `CLOUDPDF_REALTIME=in-process` with >1
replica, the migrate hook with sqlite, and the migrate hook with a PVC.
They read the documented `config.*` values only; env injected through
`extraEnv`/`extraEnvFrom` is outside their jurisdiction — if your
driver/storage kind genuinely arrives that way, acknowledge with
`gates.allowExternalConfig=true` and own those invariants.

## Licensing

The server is fail-closed: **no license key (connected) or installed
air-gapped certificate → boot exits 2.** Put `CLOUDPDF_LICENSE_KEY` in
the `existingSecret`. License-restricted mode (expired/suspended)
deliberately stays `ready` and serves read-only — a lapsed license never
restart-loops the fleet. Connected mode phones home to
`api.keygen.sh` (validation) and `api.cloudpdf.com` (usage, 5-minute
interval, one replica via DB lease); air-gapped mode makes zero
outbound calls.

## Shutdown & rollouts

On SIGTERM the server: fails `/readyz` (503 `draining`) → ends every
live SSE stream with a reconnect hint → closes the listener, bounded by
`CLOUDPDF_SHUTDOWN_TIMEOUT_MS` (default 30 s) → tears down the worker
pool and caches. Keep `terminationGracePeriodSeconds` (default 60) above
`preStopSleepSeconds` + that budget so SIGKILL never preempts teardown.

- The chart's `preStop` sleep bridges endpoint-removal propagation (the
  LB routes for a beat after pod deletion) — it complements, not
  replaces, the in-process drain.
- Rolling updates default to `maxUnavailable: 0` / `maxSurge: 1` (needs
  one pod of headroom); the PVC profile uses `Recreate`.
- SSE clients auto-reconnect through the Service/LB onto surviving
  replicas; `CLOUDPDF_SHUTDOWN_DRAIN_MS` adds a settle window for
  probe-driven balancers that must observe the 503 first (Kubernetes
  itself relies on endpoint removal, not the probe).

## Load balancing & doc affinity

Any replica serves any document correctly (the multi-replica fence);
affinity is purely a warm-cache optimization. Ship without it; reach for
it when replica counts or per-document memory make duplication visible.

- **SSE timeout rule (every LB):** idle/read timeout ≥ 2× the 25 s
  heartbeat. The chart sets nginx `proxy-read/send-timeout: 3600` when
  `ingress.className: nginx`.
- **`docAffinity.key: header`** (portable): consistent-hash the
  `X-CloudPDF-Doc` request header. nginx: `upstream-hash-by:
  "$http_x_cloudpdf_doc"` (the chart renders this on a second
  `/v1/docs`-prefix Ingress). Envoy/Gateway API: ring hash on the same
  header. HAProxy: `balance hdr(X-CloudPDF-Doc)`. Requires SDKs that
  send the header; requests without it hash to one bucket, so keep the
  non-doc Ingress unhashed (the chart does).
- **`docAffinity.key: uri`** (nginx-only): regex-extracts the docId via
  a `configuration-snippet` — managed ingress-nginx often ships
  `allow-snippet-annotations=false`, which silently disables it.
- **AWS ALB / LBs without arbitrary-key hashing:** run without affinity,
  or terminate on an in-cluster nginx/Envoy behind the ALB.
- Never build ownership directories or session migration: warmth follows
  routing, never the reverse.

## NetworkPolicy

`networkPolicy.enabled` renders a policy with allow-all placeholder
rules — narrow `ingress`/`egress` deliberately (DNS stays open when you
supply egress rules). Vanilla NetworkPolicy cannot allow egress by
hostname; for connected licensing either use a CNI with FQDN policies
(Cilium, Calico Enterprise), an egress gateway, a broad 443 allowance —
or air-gapped licensing, which is the strict-egress answer by
construction.

## Sizing

- ~1 CPU per worker thread (`CLOUDPDF_WORKER_POOL_SIZE`, default
  `min(2, cpus)`). Never `max` without a CPU limit — in a pod it sees
  the node's cores.
- Memory = base + workers × font/CMap duplication + resident-document
  working set (`maxDocsPerSlot` default 64/worker). Start 2 workers /
  2 Gi, watch RSS and render latency.
- `/data` emptyDir (`cache.sizeLimit`, default 8 Gi) must exceed
  `CLOUDPDF_CACHE_MAX_BYTES` (default 4 GiB) with upload headroom.
- `/metrics` (`metrics.enabled` → `CLOUDPDF_METRICS=1`): pool occupancy
  gauges, HTTP duration histogram by route pattern, license access,
  process defaults. Unauthenticated — scrape inside the cluster.

## Migrations

`migrations.enabled` runs `migrate up` as a pre-install/pre-upgrade hook
Job (hook-scoped config copies, so first installs and config-change
upgrades both see the right values) and forces
`CLOUDPDF_AUTO_MIGRATE=0` + `CLOUDPDF_FAIL_ON_PENDING=1` on app pods.
Independent of Helm, the migrator holds a Postgres advisory lock across
discovery + execution — two releases sharing a database, a manual
`migrate up`, and racing auto-migrations all serialize at the database.
Rollback runbook: `cloudpdf/server/MIGRATIONS.md` (there is no automatic
`migrate down` hook, by design).

## Drills

`drills/` holds the executable resilience story — see
[drills/DRILLS.md](drills/DRILLS.md): `smoke.sh` (install → test →
upgrade → crash/restart) and `crash-drill.sh` (2-replica crash timeline
with live load: no fleet-wide outage, zero committed-write loss,
per-pod MTTR).

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

| Profile         | DB / storage                                 | Replicas              | Migrations                                  |
| --------------- | -------------------------------------------- | --------------------- | ------------------------------------------- |
| Small footprint | sqlite + fs on a PVC (`persistence.enabled`) | exactly 1, `Recreate` | at boot (`CLOUDPDF_AUTO_MIGRATE=1`)         |
| Production      | postgres + s3/gcs/azure-blob                 | 1..N + HPA            | pre-upgrade hook Job (`migrations.enabled`) |

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

### Scaling out (the N-replica picture)

Four tiers route a request, same hash-family shape at each, and at every
tier affinity is performance while correctness comes from the durable
tier below:

1. **LB → pod**: `docAffinity` (above, default off). Ship OFF; flip on
   evidence: `cloudpdf_layer_write_conflicts_total` (cross-replica write
   races paying rebase churn) and `cloudpdf_engine_doc_opens_total`
   (cold-open work) climbing under multi-replica traffic are the signal.
   N > 1 requires Postgres — realtime SSE fans out cross-replica through
   the Postgres bus.
2. **pod → engine host**: WS3 host isolation — a native crash costs one
   sub-second engine respawn, never the pod. Shipped; the DEFAULT is
   still in-process until the rollout's soak completes: enable today
   with `CLOUDPDF_ENGINE_ISOLATION=host` (chart `extraEnv`).
3. **host → shard** (`CLOUDPDF_ENGINE_SHARDS`, default 1): the
   blast-radius dial — K supervised engine hosts, documents partitioned
   by docId (rendezvous, SHA-256 scores). Requires host isolation and a
   worker total that divides evenly (`M % K === 0` — boot-validated,
   the error names your valid Ks). One shard's crash/recycle costs 1/K
   of resident documents; siblings never notice; ANY shard persistently
   down makes the pod unready (deterministic routing, no failover — the
   LB reroutes those documents to healthy replicas). Leave at 1 until
   memory/attribution telemetry justifies turning it; watch
   `cloudpdf_engine_shard_up{shard}` and the per-shard
   restart/recycle counters for flapping.
4. **shard → worker thread**: sticky-by-docId with base-sha preference.

Per-tier death: a pod goes unready → the LB rehashes its documents to
healthy replicas (one cold open each); a shard dies → same story inside
the pod; a worker dies → the host respawns in under a second.

**Engine overload is a 503, not a hang**: admission control runs two
lanes (interactive, and a capped `background` lane for thumbnail warms).
Saturation sheds with `503 + Retry-After: 2` (`error.code:
"EngineBusy"`) — retry cheaply. Tune `CLOUDPDF_ENGINE_MAX_IN_FLIGHT` /
`CLOUDPDF_ENGINE_BG_MAX_IN_FLIGHT` against the
`cloudpdf_engine_queue_depth` / `_sheds_total` / `_queue_wait_ms_*`
gauges (all labelled by lane). Engine memory is observable via
`cloudpdf_engine_host_rss_bytes` and the pod working-set gauges
(`cloudpdf_container_memory_*`).

## Engine recycling (opt-in)

Long-lived native processes ratchet (PDFium caches, allocator
fragmentation). Recycling turns that into a controlled sawtooth instead
of a pod OOMKill — a _rehearsed crash_: drain, respawn, no crash-journal
strike, no quarantine attribution, no backoff. Host isolation required.

- **Enable**: `CLOUDPDF_ENGINE_RECYCLE=1` (or any knob below). OFF by
  default until your soak data justifies defaults.
- **Watermarks** (`_RECYCLE_SOFT_PCT`/`_RECYCLE_HARD_PCT`, default
  70/85): measured against THIS CONTAINER's cgroup working set over its
  limit — which includes the API process's own memory. If the API alone
  crosses the mark, recycling cannot relieve it; the ≥60s cooldown keeps
  that from becoming a recycle storm, and
  `cloudpdf_container_memory_working_set_bytes` makes it visible.
- Soft = graceful (in-flight gets a ~3s settle window; new requests park
  and complete on the successor). Hard = immediate kill (in-flight
  rejects retryably). A soft recycle escalates to hard if pressure
  crosses the hard mark mid-drain.
- **Secondary guards**: `CLOUDPDF_ENGINE_MAX_RSS_MB` (> 0) per-host RSS
  cap; `CLOUDPDF_ENGINE_MAX_LIFETIME_HOURS` jittered ±20% (the slow-leak
  hedge). Without a readable cgroup limit these are the only pressure
  sources — boot fails if none exists.
- **Watch**: `cloudpdf_engine_recycles_total{reason}` (completed recycles
  only), `cloudpdf_engine_host_rss_bytes` sawtooth, zero growth in
  `cloudpdf_engine_host_restarts_total` beyond your recycles.

## NetworkPolicy

`networkPolicy.enabled` renders a policy with allow-all placeholder
rules — narrow `ingress`/`egress` deliberately (DNS stays open when you
supply egress rules). Vanilla NetworkPolicy cannot allow egress by
hostname; for connected licensing either use a CNI with FQDN policies
(Cilium, Calico Enterprise), an egress gateway, a broad 443 allowance —
or air-gapped licensing, which is the strict-egress answer by
construction.

## Runtime confinement

The engine host is forked with a whitelisted env (no DB URL, JWT,
license key, or storage credentials — test-asserted): credential-
exposure REDUCTION, not a hard intra-pod boundary — the engine is a
same-UID child, and `/proc`-based access to the API process depends on
the node's ptrace policy (Yama). The pod runs non-root, read-only
rootfs, all capabilities dropped, `RuntimeDefault` seccomp. A PDFium RCE
is still native code in the pod; `runtimeClassName` (gVisor/Kata) adds
kernel-exploit containment for the WHOLE pod (pod-to-node isolation — it
does not separate engine from API within the pod) at syscall-emulation
cost — measure with the drills before committing. Full threat model:
`THREAD_CONFINED_RUNTIME.md`.

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

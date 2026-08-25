---
'@cloudpdf/server': minor
---

WS3 Phase C, step 0 + C1. Step 0: engine-host memory heartbeat (host
protocol v3) with RSS/heap gauges, container cgroup working-set gauges
(kubelet's formula; the pod's only while the server is its sole app container), and the C5 flip instruments
(`cloudpdf_layer_write_conflicts_total`, `cloudpdf_engine_doc_opens_total`).
C1: `SchedulingEnginePool` — two-lane admission control at the engine
dispatch choke point (interactive default; explicit `background` opt-in,
today only the thumbnail warm), bounded FIFO queues with wait deadlines,
shed as `EngineBusyError` → HTTP 503 + Retry-After, per-lane
queue/in-flight/shed/wait metrics. A shed warm leaves the thumbnail
retryable. All lane knobs are env-tunable
(`CLOUDPDF_ENGINE_MAX_IN_FLIGHT`, `CLOUDPDF_ENGINE_BG_MAX_IN_FLIGHT` —
`0` = strict background disable — `CLOUDPDF_ENGINE_[BG_]MAX_QUEUED`,
`CLOUDPDF_ENGINE_[BG_]QUEUE_TIMEOUT_MS`). Queue waits export as a real
`cloudpdf_engine_queue_wait_seconds{lane}` histogram and monotonic
totals as Counters. C4: `runtimeClassName` chart passthrough, the
engine-plane threat model in THREAD_CONFINED_RUNTIME.md, and DEPLOY.md's
"Scaling out" + "Runtime confinement" sections.

C2: opt-in engine recycling — a rehearsed crash. `EngineHostClient.recycle()`
adds the planned-exit lifecycle (drain → shutdown → immediate respawn: no
crash-journal strike, no attribution, no backoff; new work parks and
completes on the successor). `EngineRecycler` policy: the container
cgroup working set triggers (soft 70% graceful / hard 85% kill), the RSS
heartbeat picks the victim, jittered lifetime recycling and a per-host
RSS cap as secondary guards, cooldown thrash-guard. Enable with
`CLOUDPDF_ENGINE_RECYCLE=1` (+ `_SOFT_PCT`/`_HARD_PCT`,
`CLOUDPDF_ENGINE_MAX_RSS_MB`, `CLOUDPDF_ENGINE_MAX_LIFETIME_HOURS`);
boot-validated, host isolation required.
`cloudpdf_engine_recycles_total{reason}` counts them. Also fixed on the
read path (crash respawns included): a read parked across an engine
respawn now re-ensures and retries once instead of surfacing a spurious
DocNotOpen.

C3: `ShardedEnginePool` — the blast-radius dial (`CLOUDPDF_ENGINE_SHARDS`,
default 1 = today's exact object graph). K supervised engine hosts behind
a routing veneer: documents partition by docId (rendezvous with SHA-256
scores; ad-hoc work by baseSha), one shard's death costs 1/K of residents
with SCOPED cache forgetting (siblings stay warm), the write fence went
per-shard (`generationFor(docId)`), readiness fails when any shard is
persistently down, and per-shard telemetry (`cloudpdf_engine_shard_up`,
labelled restart/recycle counters) exposes flapping. Requires host
isolation and an evenly-dividing worker total (boot-validated).

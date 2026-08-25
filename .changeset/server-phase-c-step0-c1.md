---
'@cloudpdf/server': minor
---

WS3 Phase C, step 0 + C1. Step 0: engine-host memory heartbeat (host
protocol v3) with RSS/heap gauges, pod cgroup working-set gauges
(kubelet's formula), and the C5 flip instruments
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

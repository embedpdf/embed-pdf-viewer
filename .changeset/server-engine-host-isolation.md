---
'@cloudpdf/server': minor
---

Add a production Helm chart with validated SQLite and Postgres profiles, safety gates, smoke and crash drills, and OCI publishing tied to the server package version. Add Prometheus metrics, drain-aware bounded shutdown and readiness, serialized Postgres migrations, and fail-fast worker supervision.

Add opt-in supervised engine-host process isolation with generation-fenced recovery, crash journaling, document quarantine enforcement, engine health reporting, and audited quarantine CLI commands. Repeated engine crashers can be observed or rejected with `DocumentQuarantined`, while native host crashes restart the engine without terminating the API server.

Encode page renders, annotation appearances, and warm thumbnails inside engine workers by default so compressed images cross the engine boundary, with a temporary API-side encoding fallback. Add bounded interactive and background scheduling, per-host memory telemetry, controlled engine recycling, and deterministic engine sharding with per-shard readiness and metrics.

Add `POST /v1/docs/:docId/layers/:layerName/access` as the canonical layer-tier access endpoint (identity rides the path on both axes; path/body mismatches are rejected), retaining two transitional aliases removed together before GA: the body-addressed `POST /v1/access` and the short-lived doc-tier `POST /v1/docs/:docId/access`. Head responses advertise the default-layer endpoint. Allow the `X-CloudPDF-Doc` affinity header (sent by default by current SDKs) through CORS and expose retry and image metadata response headers to browser clients.

---
'@cloudpdf/server': minor
---

Add a production Helm chart with validated SQLite and Postgres profiles, safety gates, smoke and crash drills, and OCI publishing tied to the server package version. Add Prometheus metrics, drain-aware bounded shutdown and readiness, serialized Postgres migrations, and fail-fast worker supervision.

Add opt-in supervised engine-host process isolation with generation-fenced recovery, crash journaling, document quarantine enforcement, engine health reporting, and audited quarantine CLI commands. Repeated engine crashers can be observed or rejected with `DocumentQuarantined`, while native host crashes restart the engine without terminating the API server.

---
'@cloudpdf/server': minor
---

A Postgres connection that fails while idle in the pool no longer crashes the server. A database restart or failover, `pg_terminate_backend`, or a proxy closing the connection used to reach Node as an uncaught `error` event from `pg.Pool`. The pool now drops that connection and opens a new one for the next query. `createPostgresDb` takes `onIdleConnectionError` to report these, and `cloudpdf-server` logs each one's message as a warning.

---
'@cloudpdf/server': minor
---

Share links are grants: routes under `/v1/tenants/{tenantId}/grants`, the
`grants.manage` scope, and the public exchange at `POST /v1/grant-sessions`,
which takes `{ grant, passphrase }`. Migration 047 renames `share_grants` to
`grants` and `share_visitors` to `grant_visitors` with their indexes and
constraints, renames `password_hash` to `passphrase_hash`, and adds a grant's
`name`. New grants are `grt_…`, and `shr_…` grants keep working. Session tokens
name `grant:<id>`, and `security_events` records `grant.created`,
`grant.updated`, `grant.archived` and `grant.revoked`.

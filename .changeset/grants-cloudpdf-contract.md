---
'@cloudpdf/contract': minor
---

Share links are grants. The operations are `grants.*` under
`/v1/tenants/{tenantId}/grants`, the scope is `grants.manage`, and the public
exchange is `POST /v1/grant-sessions` with `{ grant, passphrase }`. Answers say
`grant`/`grants`, the record says `passphraseProtected`, and create and update
take `passphrase`. A grant has a `name` (1 to 100 characters, trimmed, or null).
New grants are `grt_…`; `shr_…` ids keep working. The errors are
`GrantPassphraseRequired` and `GrantExpired`, a layer names its `grantId`, and
every `Share*` schema and type is `Grant*`.

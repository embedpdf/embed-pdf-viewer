---
'@cloudpdf/server-modules': minor
---

`defineServerModule` takes a `name` (required), a `description` and `meters`; a request counts the module's meters with `req.meters.count(meter, { oncePerDay })`. Permissions take `replaces` and `bypassedBy`. `startTestServer`'s tenant has the given modules turned on, so their routes answer instead of `403 FeatureNotEnabled`.

---
'@cloudpdf/server': minor
---

Every error response is `{ error: { code, message, details? } }` with a code from `EngineErrorCode`. An engine error no longer carries `name`. A license refusal is `LicenseInvalid` with the license status's code in `details.licenseCode`; a usage limit says its `metric` and `limit` in `details`; a thumbnail that isn't ready says its state in `details.state`; `BadInput` is `InvalidArg`; and an error from Fastify itself carries the code for its status instead of Fastify's own.

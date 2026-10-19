---
'@cloudpdf/contract': minor
---

Document `Idempotency-Key` on every layer write operation (`idempotencyKeyHeader`): a retry under the same key on the same layer answers with what the first request committed. The error codes include `ObjectNumberUnavailable` and `LayerFull`.

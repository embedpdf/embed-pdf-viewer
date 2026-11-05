---
'@embedpdf/engine-core': minor
---

One error body for every HTTP error, `ErrorResponseSchema` (`{ error: { code, message, details? } }`), and `EngineErrorSchema` for the error inside it, replacing `EngineErrorPayloadSchema`. A serialized `EngineError` no longer carries `name`. `EngineErrorCode` is the one code list: it gains the codes the server sends (`Conflict`, `EngineBusy`, `EngineRestarting`, `DocumentQuarantined`, `ThumbnailNotReady`, `TooManyRequests`, `GrantExpired`, `OriginRequired`, `OriginNotAllowed`, `FeatureNotEnabled`, `FeatureStopped`, `LicenseInvalid`, `LicenseUsageLimit`, `UpstreamError`), and `isEngineErrorCode` tells whether a value is one. `SignatureWireComponents` names `DocMdpPermission` and `FieldLockSpec` for the OpenAPI document.

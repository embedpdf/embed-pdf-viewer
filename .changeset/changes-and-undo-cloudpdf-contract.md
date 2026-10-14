---
'@cloudpdf/contract': minor
---

Add `doc.changes` (`POST /v1/docs/{docId}/layers/{layerName}/changes`): user actions as changes, each applied all or none, or the undo of an earlier change, answered in order with each change's result or refusal.

The OpenAPI document names every shared model once and refers to it: page, annotation and field refs, form fields, drafts and patches, a write's meta, the metadata, and each plane's error envelope (every error response is now `EngineErrorPayload` or `AdminErrorPayload`, not a copy per operation and status). Models are no longer inlined per response, so the generated SDKs carry one type per model instead of one per place it appears.

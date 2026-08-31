---
'@cloudpdf/server': minor
---

Action reads served by `/v1/docs/:docId/actions@:token` (and the layer-scoped variant) now include interpreter payloads on every executable node and the destination-form `/OpenAction` as `openDestination`, via the shared engine-services reader. The wire representation of action nodes changed shape (payload-carrying discriminated union); deploy server and clients from the same prerelease train.

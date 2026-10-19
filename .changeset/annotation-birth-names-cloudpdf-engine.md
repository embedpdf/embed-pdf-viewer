---
'@cloudpdf/engine': minor
---

Address annotations by their life-long ref on every call: updates, deletes and resource reads go to `obj:N` or `base:N`. Remove weak edit sessions (`doc.annotations.beginEdit`) and `capabilities`; a bare HTTP 409 maps to `LayerVersionConflict`.

Every write takes its options last, with an `opId`; the events of this session's writes carry it as `origin.tx`, and every event from another session carries one too. A create's bytes go in the options (`{ resources }`).

A document's writes go out one at a time, in the order they were called, each with its `opId` as `Idempotency-Key`; a write lost on the network is sent again under the same key, and the server applies it once. `X-Engine-Session-Id` goes only where the server reads it: writes, `/access`, the event stream and the bulk reservation, so other reads stay plain requests a CDN can answer without a preflight. Only reads (`GET`, `HEAD`) go to the CDN: a write whose path matches a read the CDN serves now reaches the server.

`doc.objectNumbers` holds this editing session's object numbers. An open that may create calls `/access` for the first 8; a write tops the pool up when it runs low; the event stream's `session` events keep it in step with the server, and `reserve(n)` calls `POST …/object-numbers`. Creates send the numbers they name (`objectNumber`, `objectNumbers`, `widgetObjectNumbers`, `splitObjectNumber`). `onLost` reports numbers the session can no longer use: `'reclaimed'` when the server took them back after the session expired, `'versioned'` after a signature published a new version.

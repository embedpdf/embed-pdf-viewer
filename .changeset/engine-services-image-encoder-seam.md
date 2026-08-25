---
'@embedpdf/engine-services': minor
---

`WorkerHost` accepts an optional injected `WorkerImageEncoder` (third
constructor argument) and dispatches the new `*.renderEncoded` kinds
through it on a narrowly-scoped async path. No new dependencies: the
native encoder stays in the injecting package. Hosts without an encoder
(browser/local workers) reject those kinds with `NotImplemented`;
existing two-argument construction is unchanged.

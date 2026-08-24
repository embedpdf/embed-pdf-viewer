---
'@cloudpdf/viewer': minor
---

Share sources pass through to the engine; the viewer-only share vocabulary is retired.

- `{ kind: 'share' }` is a standard `OpenInput` kind now, resolved by `engine.open()` itself — `resolveCloudConfig` no longer lowers share entries into token sources, and no longer re-threads `baseUrl`/`fetch` into the exchange.
- BREAKING (prerelease line): on share sources the grant passphrase field is `sharePassword` (was `password`, which now means the PDF's own encryption password — the same slot every other kind uses). The top-level `shareToken`/`sharePassword` shorthands are unchanged.
- `CloudShareSource` and `CloudInitialDocument` remain as deprecated aliases of `OpenInputShare` and `InitialDocument`.

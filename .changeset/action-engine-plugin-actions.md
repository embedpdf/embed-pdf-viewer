---
'@embedpdf/plugin-actions': major
---

Introduces the PDF action engine: one policy-gated dispatcher for the payload-carrying `/A` action trees (`execute`/`canExecute`, `dispatch`/`canDispatch` by annotation ref). Domain plugins register executors and sinks through the `/contract/host` lens (stage: goto/named; form: javascript/reset-form; annotation: the session-visibility sink), the framework installs a URI/Print UI adapter via `setUiAdapter`, and `onAction`/`onDiagnostic` event hooks report every dispatch. Chains walk in PDF `/Next` order with document-lifetime work first and navigation/external effects deferred until it succeeds; `launch`/`goto-remote`/media stay never-executable and incomplete trees are refused whole.

Phase 2 adds annotation `/AA` events, ordered page lifecycle events, and the document-open sequence. Dispatch now submits synchronously into the serial queue, returns per-step trigger results, derives origin centrally, and never rejects. The lifecycle coordinator buffers initial page state behind the open barrier and caps programmatic cascades; `/A` shadows `/AA U`. The shared hover pump coalesces Exit→Enter pairs, and configuration can gate triggers and the open sequence.

The package now publishes bundle-safe `/contract` and `/contract/host` entries. They expose the public and sibling-host protocols over the same token without pulling in dispatcher or plugin wiring; the package root remains the explicit implementation opt-in.

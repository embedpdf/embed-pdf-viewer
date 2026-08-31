---
'@embedpdf/plugin-actions': major
---

Introduces the PDF action engine: one policy-gated dispatcher for the payload-carrying `/A` action trees (`execute`/`canExecute`, `dispatch`/`canDispatch` by annotation ref). Domain plugins register executors and sinks through the `/internal` host lens (stage: goto/named; form: javascript/reset-form; annotation: the session-visibility sink), the framework installs a URI/Print UI adapter via `setUiAdapter`, and `onAction`/`onDiagnostic` event hooks report every dispatch. Chains walk in PDF `/Next` order with document-lifetime work first and navigation/external effects deferred until it succeeds; `launch`/`goto-remote`/media stay never-executable and incomplete trees are refused whole.

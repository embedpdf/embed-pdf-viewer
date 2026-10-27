# @embedpdf/plugin-actions

## 3.0.0-next.17

## 3.0.0-next.16

### Minor Changes

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – An action can come from an outline item: `ActionSource` and `ActionTreeSource` gain `{ kind: 'outline', item }`, and a script an outline item runs sees `event.type` `'Bookmark'`, as in Acrobat.

### Patch Changes

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – The document's print actions run around the kernel's print. The plugin registers `ctx.aroundPrint`, so WillPrint and DidPrint run around every print dialog, and a Named Print action or a script's `this.print()` prints through `documents.print()` when the kernel has a printer (a print a script starts without a user's tap stays refused). Without a printer, the UI adapter's `print()` is used as before.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The actions plugin keeps no state of its own: `ActionsAction` and `ActionsState` are no longer exported. The per-page trigger cache is cleared by flattens, redactions and new document versions, and a read that was in flight when its page changed no longer fills the cache with a stale tree. `ScriptRealmTarget.document()` needs only a document's name, page count and pages (`ScriptDocument`). The `/internal` entry is removed; hosts use `/contract/host`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The actions plugin now follows the 3.0 public contract.
  - `ActionsPluginConfig` is `ActionsConfig`; `policy` accepts row-wise patches (name only the origins you change).
  - `onAction` is `onExecuted`. New `onOpenSequenceCompleted({ result })` fires once the document-open sequence has run.
  - New public methods: `executeNamed(name, context?)` runs a Named verb without building a tree; `getActionTree(source)` reads the raw `/A` or `/AA` tree of an annotation, field, page or the document; `getPolicy()` / `updatePolicy(patch)` read and change the effective policy live; `isScriptingEnabled()` reports whether a script realm exists.
  - `registerExecutor` is public (application code can interpret or override an action type); `ActionExecutor` / `ActionExecutorResult` are exported from `/contract`, as are `ActionTriggerEvent`, `eventOf`, `ActionTreeSource`, `ActionPolicyPatch`, `PdfFieldEventKind`, `PdfNamedAction` and `OpenSequenceCompletedEvent`.
  - `originOf(trigger)` is `triggerOriginOf` so it no longer shadows the kernel's `originOf(event)` through the framework barrels.
  - The plugin is defined on `create()`.
  - Internal layout: `contract` / `host-contract` / `model` / `controller` with `services`, `submit`, `scripting`, `dispatch` and `lifecycle` areas. The `/internal` entry is removed; hosts use `/contract/host`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `documents.download()` and `downloadLayer()` run the document's save actions (WillSave, then the read, then DidSave) by themselves, so an app no longer wraps a download in `runDocumentVerb('save', …)`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A form commit sink resolves `{ status: 'applied' | 'failed', error? }` (`FormCommitSinkResult`): a script run's form effects are one change, written whole or not at all.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - `registerFormReader()`: scripts, widget events, field actions and Hide actions read the form plugin's form, with the fills still on their way, instead of reading it from the engine each time.
  - The form commit sink answers once the effects are staged: `applied` means they show and are on their way, and a refusal arrives through the change queue.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Action sources, triggers, hover targets and page-state reports identify pages with `page: PageRef` (`currentPage`, `visiblePages`); annotation commit entries carry `page`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The actions plugin has live settings: `policy`, `triggers`, `openSequence` and `javascript` (`enabled`, `identity`), with `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`. `actionsPlugin(config)` registers them over `ACTIONS_DEFAULTS`; the script environment (`sandboxFactory`, `now`, `budget`, …) stays registration-only beside `javascript`'s settings. A policy or trigger change applies to the next action, a new `javascript.identity` to the next script, and `javascript.enabled` to the documents opened after it. `getPolicy()` and `updatePolicy()` are gone.

  The events are `onExecuted { tree, result, source }`, `onDiagnosticReported { code, action, source }`, `onScriptDiagnosticReported { code, message }` and `onScriptFailed { error, source }` (were `onDiagnostic`, `onScriptDiagnostic` and `onScriptError`). A `'block'` rule stops an action quietly; `'report'` reports it.

  `canExecuteNamed(name, context?)` answers whether `executeNamed()` would run a viewer action; `'Print'` also needs `doc.print`. `execute`, `executeNamed`, `dispatch`, `getActionTree`, `runDocumentVerb` and `prepareClose` take a `signal`: `execute` rejects `operation-cancelled`, and a tree that is running stops before its next node; `dispatch` and `prepareClose` never reject and resolve `cancelled`. The contract exports `PdfActionTree`, `PdfActionNode` and `PdfActionType`.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Match annotations by `annotationKey`, for the two ref kinds an annotation can have.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Internal: the controller composes through the kernel's `composeApi`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The plugin's definition takes its types from its token, state and settings instead of type arguments. It declares no settings of its own, so its definition's settings type is `NoSettings`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Follows the removal of `forms.imported`: a form import now fires one `forms.created` or `forms.valueSet` per field.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A widget's actions are read from the form's widget rows, so a session that may only fill still finds them; an annotation's from the page's annotations.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Page actions are read again after `forms.widgetDeleted` and `forms.widgetRestored`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Page actions are read again after `annotations.reordered` and `forms.widgetsReordered`.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Major Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Introduces the PDF action engine: one policy-gated dispatcher for the payload-carrying `/A` action trees (`execute`/`canExecute`, `dispatch`/`canDispatch` by annotation ref). Domain plugins register executors and sinks through the `/contract/host` lens (stage: goto/named; form: javascript/reset-form; annotation: the session-visibility sink), the framework installs a URI/Print UI adapter via `setUiAdapter`, and `onAction`/`onDiagnostic` event hooks report every dispatch. Chains walk in PDF `/Next` order with document-lifetime work first and navigation/external effects deferred until it succeeds; `launch`/`goto-remote`/media stay never-executable and incomplete trees are refused whole.

  Phase 2 adds annotation `/AA` events, ordered page lifecycle events, and the document-open sequence. Dispatch now submits synchronously into the serial queue, returns per-step trigger results, derives origin centrally, and never rejects. The lifecycle coordinator buffers initial page state behind the open barrier and caps programmatic cascades; `/A` shadows `/AA U`. The shared hover pump coalesces Exit→Enter pairs, and configuration can gate triggers and the open sequence.

  The package now publishes bundle-safe `/contract` and `/contract/host` entries. They expose the public and sibling-host protocols over the same token without pulling in dispatcher or plugin wiring; the package root remains the explicit implementation opt-in.

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Document lifecycle events + the submit sink chain (Phase 4). The five catalog `/AA` verbs (ISO 32000-2 Table 200 — WC/WS/DS/WP/DP) dispatch through the trigger spine (`{scope:'document', event:'will-save'|…}`), with the open-ordering law: catalog `OpenAction` can never run AFTER a lifecycle verb. NEW `runDocumentVerb('save'|'print', operation)` — before-event → operation → after-event as ONE serialized queue op (two saves can never interleave; a before-event failure never cancels the verb; an operation throw skips the after-event and rethrows) — and `prepareClose()` (the cooperative WC door; scripts never run in teardown). The Print door fires WP → adapter EXACTLY once → DP under one latch: a nested print request (a WillPrint script calling `doc.print()`) is suppressed with a `reentrant-print` diagnostic, never a second dialog; an adapter throw skips DP. SubmitForm graduates from hard-blocked to the SINK CHAIN — embedder `setSubmitHandler` (consent = installation; detached-promise contract: `executed` means handed to the embedder) → the document's home (`doc.forms.submit`, engine-asserted, awaited) → blocked with `no-submit-sink`; the form plugin registers the ONE dataset resolver (`registerSubmitResolver`), both action nodes and script `doc.submitForm()` effects normalize to one `SubmitIntent`, and policy gains a `'submit-form'` row (user-origin only by default). The catalog read is memoized per document with rejection eviction. Ships `submitEntriesToUrlEncoded` for handlers. The plugin still never touches a network.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – THE JavaScript switch lives here now: `actionsPlugin({ javascript })` owns the per-document ScriptHost realm, registers the real `javascript` executor (page-scoped world prefetch → boot → run → owner-sink commits → surface, ALL inside the host transaction — the commit-inside-the-boundary law), and exposes the transaction port + `surfaceScriptResult` on `contract/host`. Owner commit sinks replace direct engine writes (`registerFormCommitSink` / `registerAnnotCommitSink` — each plugin commits AND reconciles its own model, so the PDF and the pixels can never diverge). Trigger provenance reaches executors (`ActionContext.event` + `eventOf`), and — full ISO — the Hide action routes by OWNING plane: field names and widget object numbers become form `setDisplay` effects, plain annotations become document flag patches; the session-visibility sink (`SessionEffectSink`/`registerSessionSink`) is REMOVED. `ActionUiAdapter` gains `alert`/`gotoPage` (+ print context) as the ONE UI port for every script effect, with the `doc.print` authority gate upstream and `onScriptDiagnostic`/`onScriptError` hooks. A deterministic per-dispatch JS node cap (`maxScriptNodesPerDispatch`) bounds `/Next` chains.

# @embedpdf/core-acrojs

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Complete the Acrobat AF forms support library in the scripting prelude: `AFNumber_Keystroke`, `AFPercent_Keystroke`, `AFDate_Format`/`AFDate_Keystroke`(`Ex`), `AFTime_Format`(`Ex`)/`AFTime_Keystroke`, `AFSpecial_Format`/`AFSpecial_Keystroke`, `AFRange_Validate`, `AFMergeChange`, `AFMakeNumber`, and `AFExtractNums`, with Acrobat-compatible rejection alerts, a lenient scand-style date parser, and new `h`/`hh`/`tt` 12-hour tokens in `util.printd`. Forms built with Acrobat's standard number/date/time/special formats (for example the Apryse demo form) now validate, format, and auto-calculate instead of failing on missing globals.

  `javaScriptSourcesFromActionTree` now narrows on the payload-carrying action-node union and collects only `javascript` arms; rendition `/JS` remains represented but is deliberately not executed. A new `ui-effect-suppressed` diagnostic also makes permission-withheld script UI effects observable.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – `doc.submitForm(...)` emits a submit INTENT (Phase 4): both Acrobat forms — positional `(cURL, bFDF, bEmpty, aFields)` and the argument object (`cURL/aFields/bEmpty/cSubmitAs/bGet`) — become a `{kind:'submitForm'}` UI effect (include-mode field names; `cSubmitAs` beats `bFDF`; nothing in the VM ever touches a network — resolution and the sink chain live outside). Doc-typed events now carry `event.target = the Doc object` (Acrobat's WillSave boilerplate does `event.target.getField(...)`). The v1-frozen posture constants are honest again: `submitForm: 'sink-chain'`, `catalogLifecycleActions: 'execute-on-verb'`, page/annotation events `execute-*` — the actions plugin's policy is the live authority these document.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The ScriptHost and the annots plane. `createScriptHost` owns the ONE realm per document (its own serialized transaction port; lazy name-tree boot delivered exactly once to the first transaction; resource faults poison and lazily rebuild the realm; per-run and caller-sliced budgets). The script world grows the curated annotation plane: `this.getAnnots({nPage})` / `getAnnot(nPage, name)` over a caller-prefetched, page-scoped input (null when nothing matches — Acrobat parity; unfetched pages are a NAMED compatibility deviation), `Annot` wrappers with a per-subtype validity matrix (`ANNOT_WRITABLE_KEYS`, drift-guarded against the kind registry; no dictionary access — the Acrobat model), `setProps`/`getProps`, and diff-derived canonical `annotEffects` beside `formEffects` (declared cross-plane commit order: form first, then annot). Ships the standard `color` object (constants + `convert`/`equal` with the documented G/RGB/CMYK vectors), Acrobat `{type, name}` event overrides, and — cycle fix — the `ScriptSandbox`/`ScriptSandboxFactory` structural contract now lives HERE (`core-js-sandbox` implements and re-exports it).

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the pure Acrobat JavaScript compatibility core. It defines deterministic document-script contracts, security policy, and the VM prelude used to execute supported PDF form scripts consistently.

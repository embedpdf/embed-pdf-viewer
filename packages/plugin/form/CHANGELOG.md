# @embedpdf/plugin-form

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Widget activation joins the action engine: with `@embedpdf/plugin-actions` installed, `activateWidget` delegates the full `/A` tree to the dispatcher (return type is now `WidgetActivationResult`, discriminating the two worlds), so Hide/ResetForm push buttons work with scripting disabled. The host lens exposes the interim executors' doors: `runActivationScript` (one JS node as a widget transaction) and `resetFormAction` (three-state target resolution, one batch reset skipping non-resettable families, recalculate after). Executor-driven form mutations ride the same serial mutation queue as user commits — strictly actions-queue → form-queue, never the reverse.

  The widget DOM-event door dispatches widget `/AA` trees, including coalesced hover events. Activation now submits synchronously through the dispatcher, and script UI effects carry their dispatch origin; print requests without document permission are withheld with an observable diagnostic.

  Form scripting is fault-tolerant per event: Keystroke, Validate, Calculate, and Format exceptions degrade to diagnostics while explicit `event.rc = false` remains a rejection and resource-budget faults still fail the transaction. Keystroke actions now run Acrobat's typing and commit passes so standard AF validators and custom transforms see the expected event shape.

  Publish bundle-safe `/contract` and `/contract/host` entries over the same form token, plus a focused `/scripting` helper entry. `/internal` remains an implementation visibility surface rather than the sibling bundle boundary.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The submit dataset resolver + the reset() symmetry fix (Phase 4). `resolveSubmitDataset` (registered as THE actions submit resolver) does a FRESH engine read and applies the ISO Table-239/240 semantics through the new shared `field-selection` module: include-mode NAMES select descendants by FQN dot-prefix (fixing the ResetForm exact-match conformance bug too — Tables 241/242 want subtrees), the NoExport veto is unconditional (diagnosed when explicitly listed), explicitly listed push-buttons/signatures and unsupported `/V` shapes are DIAGNOSED (`submit-entry-unsupported`), never silently dropped, and IncludeNoValueFields yields name-only entries. `resetFormAction` gains an origin parameter threaded from the executor's ActionContext — a lifecycle/hover ResetForm can no longer launder its recalculation alerts into user origin — and the public `form.reset(key)` now rides the SAME shared reset core (one effects batch → refresh → V/C/F recalculation), so a dependent calculated field can no longer go stale through the API door.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The K/V/C/F pipeline rides the shared realm: `FormScriptingController` keeps its ordering, `event.rc` semantics, two-pass keystroke, overlay, and fault ladder UNCHANGED, but acquires the realm through a transaction port — the actions plugin's per-document host in viewers, or a self-owned standalone host (`createFormScriptingHost` / the `{ config }` constructor arm) for stamp and tests. The snapshot moves INSIDE the transaction boundary (`commit(ref, value)` / `activate(ref, action)` / `recalculate()` — no snapshot parameters). `formPlugin({ scripting })` is DELETED (the switch is `actionsPlugin({ javascript })`); the interim `runActivationScript` executor and the form-side UI-effect provider (`setUiEffectProvider`/`FormUiEffectProvider`) are gone — every script surface flows through the actions port with origin/phase attached, and the new `commitScriptFormEffects` sink commits script form effects with engine write + snapshot AND annotation-plane reconciliation in one place.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add `canRead()`, `canFill()`, and `canDesign()` permission helpers, replacing
  `canModify()`. Form hydration and mutations now refuse unauthorized work
  locally, and realtime desync events trigger a full form snapshot refresh.

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

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt interactive-form plugin. It provides reactive field state, fill-mode controls, form-data import and export, and sandboxed Acrobat JavaScript execution while keeping widgets integrated with the annotation plane.

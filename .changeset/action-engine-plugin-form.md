---
'@embedpdf/plugin-form': minor
---

Widget activation joins the action engine: with `@embedpdf/plugin-actions` installed, `activateWidget` delegates the full `/A` tree to the dispatcher (return type is now `WidgetActivationResult`, discriminating the two worlds), so Hide/ResetForm push buttons work with scripting disabled. The host lens exposes the interim executors' doors: `runActivationScript` (one JS node as a widget transaction) and `resetFormAction` (three-state target resolution, one batch reset skipping non-resettable families, recalculate after). Executor-driven form mutations ride the same serial mutation queue as user commits — strictly actions-queue → form-queue, never the reverse.

The widget DOM-event door dispatches widget `/AA` trees, including coalesced hover events. Activation now submits synchronously through the dispatcher, and script UI effects carry their dispatch origin; print requests without document permission are withheld with an observable diagnostic.

Form scripting is fault-tolerant per event: Keystroke, Validate, Calculate, and Format exceptions degrade to diagnostics while explicit `event.rc = false` remains a rejection and resource-budget faults still fail the transaction. Keystroke actions now run Acrobat's typing and commit passes so standard AF validators and custom transforms see the expected event shape.

Publish bundle-safe `/contract` and `/contract/host` entries over the same form token, plus a focused `/scripting` helper entry. `/internal` remains an implementation visibility surface rather than the sibling bundle boundary.

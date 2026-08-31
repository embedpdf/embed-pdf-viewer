---
'@embedpdf/plugin-form': minor
---

Widget activation joins the action engine: with `@embedpdf/plugin-actions` installed, `activateWidget` delegates the full `/A` tree to the dispatcher (return type is now `WidgetActivationResult`, discriminating the two worlds), so Hide/ResetForm push buttons work with scripting disabled. A new `/internal` host lens exposes the interim executors' doors: `runActivationScript` (one JS node as a widget transaction) and `resetFormAction` (three-state target resolution, one batch reset skipping non-resettable families, recalculate after). Executor-driven form mutations ride the same serial mutation queue as user commits — strictly actions-queue → form-queue, never the reverse.

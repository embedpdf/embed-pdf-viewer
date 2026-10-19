---
'@embedpdf/engine-core': minor
---

A widget's actions can be written: `doc.forms.updateWidget()` takes `actions` (`WidgetActionsPatch`: `activate` and the widget's other events, each a `PdfActionWrite` or `null` to remove it; an event left out keeps its action; `actions: null` removes them all), and so does each widget placement of `create()` and `addWidget()`. A read's `actions` passed back unchanged keeps them. Undo puts them back. Destinations are in page space, as everywhere.

An action that runs a script, submits or opens a URI takes `doc.forms.script` too; go-to, named, hide and reset-form need `doc.forms.modify` alone. `writesScripts()` takes a widget patch, and a read's trees count as none; new `draftWritesScripts()` covers a draft's field and widget actions. New `widgetActionsOf()` (a widget's read actions as a patch), `WIDGET_ACTION_EVENTS`, `WidgetActionEvent`, and the schemas `PdfActionWriteSchema` and `WidgetActionsPatchSchema` (named components `PdfActionWrite`, `WidgetActionsPatch`). `runFormScriptConformance` covers widget actions.

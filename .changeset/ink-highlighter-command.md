---
'@embedpdf/snippet': patch
---

Add `annotation:add-ink-highlighter` command and toolbar button for the ink highlighter tool.

The command toggles the `inkHighlighter` tool, respects the `ModifyAnnotations` permission, and is registered under the `annotation` and `annotation-ink` categories. The corresponding button is inserted into all relevant toolbar and mobile-menu slots next to the existing ink pen button.

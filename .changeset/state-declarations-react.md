---
'@embedpdf/react': minor
---

`stateHook(declaration)` turns a state declaration from `defineState()` into a hook: `const useSearchState = stateHook(searchState)`. The hook returns the state of the document in scope (the nearest `<DocumentScope>`, else the active document), or the declaration's `empty` while that document isn't open or ready, so it renders anywhere. It takes an optional selector, `useSearchState((state) => state.hitCount)`, and re-renders only when a field of the state, or the selected value, changes.

Plugin hooks such as `useSearch()` and `useShell()` no longer throw when no document is open. Until a document is ready they return a stand-in: rendering works, and calling one of its methods throws a `PluginError` with code `not-ready` ("no document is open"). The stand-in is the same object on every render. A plugin that isn't registered still throws, and `useSelector` still throws the kernel's reason without a document; `useOptionalSelector` and the state hooks are the ones to use in chrome that renders before the first document.

`useToolCursor()` and `<SelectionClipboard>` work without a document: they install their cursor or wire the clipboard once a document is ready. Inside a `<DocumentScope>`, `useDocuments()` returns that document's verbs, so `save()` and `saveLayer()` without an id save the document in scope. `useDocumentScope()` returns the id the nearest `<DocumentScope>` binds, or `null` when the subtree follows the active document.

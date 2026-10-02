---
'@embedpdf/vue': minor
---

Add `@embedpdf/vue`, the Vue 3 adapter, with one entry point per feature: `runtime`, `stage`, `render`, `interaction` and `anchored`.

- `@embedpdf/vue/runtime`: `<Viewer>` creates the kernel when it mounts and destroys it when it unmounts (`:engine`, `:plugins`, `:initial-documents`, the `:identity`, `:scope`, `:accent` and `:page` settings, `@ready`, and `#fallback` and `#error` slots). `<DocumentGate>` renders its content while the document is ready, with `#fallback`, `#locked` and `#error` slots, and `<DocumentScope :id>` binds a subtree to one document. `useDocuments()`, `useDocument()`, `useDocumentsState()`, `useDocumentsEvent()`, `usePageList()` and `useViewerSettings()` read the documents as refs, and `usePage()` gives a layer its page.
- `@embedpdf/vue/stage`: `<Stage>` with `#page`, `#page-chrome` and `#overlay` slots, `v-model:page`, `v-model:zoom` and `v-model:tool`, a second view through `:token` or `<StageScope>`, `<Scrollbar>`, and `useStage()`, `useStageState()`, `useStageSettings()`, `useStageEvent()` and `useScrollMetrics()`.
- `@embedpdf/vue/render`: `<RenderLayer>` (`:annotations`, `:tiles`), `useRender()`, `useRenderSettings()` and `useRenderEvent()`.
- `@embedpdf/vue/interaction`: `<PagePointerSource>`, `useInteraction()`, `useInteractionState()`, `useInteractionSettings()`, `useInteractionEvent()` and `useToolCursor()`.
- `@embedpdf/vue/anchored`: `<Anchored>` places UI next to a box on a page, in the Stage's `#overlay` slot.

A plugin's composable returns an object that always calls the capability of the document in scope, so it is safe to keep in a closure; before a document opens its methods throw `not-ready`, and its settings calls work. State composables return one ref per field, or one ref for the value a selector picks, and update only when that value changes. An argument that can change takes a ref or a getter.

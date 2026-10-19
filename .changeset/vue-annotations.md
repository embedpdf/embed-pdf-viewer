---
'@embedpdf/vue': minor
---

Add `@embedpdf/vue/annotation`, the Vue view of the annotation plugin.

- `<AnnotationLayer>` draws a page's annotations, the selection's outline and handles, the tool's preview and the text boxes being typed in. `:renderers` draws some annotations with your own components: each gets `annotation`, `frame`, `native` (the layer's own drawing, drawn with `<component :is="native" />`), `appearance`, `hovered`, `selected` and `interactive` as props. An `interactive` renderer takes the pointer, so its buttons can be clicked; one that only draws stays out of the pointer's way. The `#handle` and `#rotation-handle` slots draw the handles your way, while the viewer still decides where they can be grabbed.
- `<AnnotationMenu>`, `<AnnotationDraftMenu>` (its slot gets the shape being drawn as `draft`) and `<AnnotationRotationBadge>` float your UI over the selection, a polygon in progress and a turn, in the Stage's `#overlay` slot.
- `useAnnotation()`, `useAnnotationState()`, `useAnnotationSettings()` and `useAnnotationEvent()`; `useAnnotationList(filter?)`, `useAnnotationDefaults(toolId)`, `useAnnotationProperties(toolId?)` and `useAnnotationAnchor(ref)` are refs that take a getter for an argument that changes.
- `useComments()`, `useCommentThreads()` and `useCommentThread(ref)`: the comments API and the threads with their page's index and label, as refs.
- `useRichTextEditor(annotation)` makes your own element a text box's editor, inside a renderer: `ref` goes on the element as `:ref`, and `style` and `editing` are refs. It can be focused and typed in while the text box is being edited.
- `useFilePickerProvider(provider?)` installs the file dialog behind the stamp and file attachment tools while the component lives.

The entry re-exports the plugin, so `annotationPlugin()` comes from the same import as `<AnnotationLayer>`.

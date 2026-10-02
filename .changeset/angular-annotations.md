---
'@embedpdf/angular': minor
---

Annotations in Angular: `@embedpdf/angular/annotation`.

- `withAnnotation(options)` and `inject(EpdfAnnotation)`: the plugin's methods (`create()`,
  `update()`, `delete()`, `move()`, `export()`, `import()`, …), the State table as signals
  (`status()`, `selected()`, `hovered()`, `editing()`), the parts as namespaces
  (`selection`, `draft`, `text`, `tools`, `stamps`, `links`), every event as a stream
  (`created$`, `writeFailed$`, `selectionChanged$`, `tools.defaultsChanged$`, …) and the
  settings. The reads a template follows are members that take a value or a function:
  `watch(filter)`, `anchorOf(ref)`, `selection.properties()`, `tools.defaultsOf(id)` and
  `tools.propertiesOf(id)`. The checks (`canCreate()`, `canDelete(ref)`,
  `selection.canGroup()`, `stamps.isArmed()`) follow the document in a template.
- `inject(EpdfComments)`: every thread with its page label as `threads()`, one as
  `threadOf(ref)`, the verbs (`reply()`, `setText()`, `setStatus()`, `setMarked()`, `delete()`,
  `deleteThread()`), the checks and `threadChanged$`.
- `<epdf-annotation-layer>` draws a page's annotations, the selection's outline and handles, the
  tool's preview and the text boxes being typed in. Your own look for some annotations is an
  `<ng-template [epdfAnnotation]="predicate" let-annotation let-frame="frame">` inside it (a
  subtype works too: `epdfAnnotation="stamp"`); it draws into a frame placed, turned and scaled
  like the annotation, gets the layer's own drawing as `native`, and with
  `epdfAnnotationInteractive` (or a function of the active tool) takes the pointer.
  `<ng-template epdfHandle>` and `<ng-template epdfRotationHandle>` draw the handles your way.
- `[epdfRichTextEditor]="annotation"` makes your element a text box's editor in a look, with the
  box's body style and `editing()` (`#editor="epdfRichTextEditor"`).
- `<epdf-annotation-menu>`, `<epdf-annotation-draft-menu #menu>` (with `draft()`) and
  `<epdf-annotation-rotation-badge>` float your UI next to the selection, a polygon being drawn
  and a turn in progress, inside `<epdf-stage>`.
- `withFilePicker(provider?)` gives the stamp and attachment tools their file: the browser's
  file dialog, your own function, or `null`, for every document the viewer opens.

---
'@embedpdf/react': minor
---

`/annotation` has the four hooks every plugin has: `useAnnotation()`, `useAnnotationState()` (`status`, `selected`, `hovered`, `editing`), `useAnnotationEvent()` and `useAnnotationSettings()`. `useAnnotationList(filter)`, `useAnnotationDefaults(id)` (was `useToolDefaults`), `useAnnotationProperties(toolId?)` (was `useSelectionFields`, `useToolFields` and `useSelectionFlags`), `useAnnotationAnchor(ref)` and `useRichTextEditor(annotation, page)` are new; `useAnnotationSelection`, `useAnnotationSelected`, `useAnnotationStatus` and `useAnnotationRotation` are gone. `AnnotationMenu`, `AnnotationDraftMenu` and `AnnotationRotationBadge` come from `/annotation` (the `/annotation-menu` entry is gone); the menu hides while the selection is dragged, and the badge shows the angle in the `chrome.readout` colors without children.

Renderers get the annotation: `for(annotation)`, and the component's props are `{ annotation, box, page, native, appearance, hovered, interactive }`; `interactive` takes a function of `{ annotation, toolId }`. `<AnnotationLayer components={{ Handle, RotationHandle }}>` draws your own handles. Every chrome color, width and dash paints through its `--epdf-annotation-*` variable, and follows the viewer's accent unless `chrome.accent` is set.

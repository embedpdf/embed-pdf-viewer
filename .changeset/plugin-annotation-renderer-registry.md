---
'@embedpdf/plugin-annotation': minor
---

Added annotation renderer registry and enhanced annotation capabilities:

- Added `purgeAnnotation()` method to remove annotations from state without calling the PDF engine
- Added annotation renderer registry allowing external plugins to register custom annotation renderers
- Added `useRegisterRenderers()` hook and `AnnotationRendererProvider` context for renderer registration
- Changed interaction properties (`isDraggable`, `isResizable`, `lockAspectRatio`) to support dynamic functions based on annotation
- Added `AnnotationCommandMetadata` interface for history command filtering
- Added `isRedact()` helper function for type-checking redact annotations
- Framework exports now include `AnnotationPluginPackage` with `AnnotationRendererProvider` wrapper

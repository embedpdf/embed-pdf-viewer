---
'@embedpdf/engine-core': minor
---

Every multipart message has one shape: a JSON `body` part, and each file as a part `resource:<key>` that the body names by role, `resources: { <role>: <key> }`. New key schemas (`ResourceKeySchema`, `AnnotationResourceKeysSchema`, `AppearanceResourceKeysSchema`, `FileResourceKeysSchema`, `SourceResourceKeysSchema`, `ImageResourceKeysSchema`). `WireAttachmentFile` names its file as `resources.file`; a page insert's body names its source as `resources.source`; a signature's drawn appearance and a prepare's artwork are `resources.appearance`, and so is the `forms.setSignatureAppearance` change op on the wire. An appearance batch's entries name their image as `resources.image`. Renamed: `AnnotationAppearanceManifest` → `AnnotationAppearanceBatch` (and its entry and schema), `AnnotationImportManifest` → `AnnotationImportBody` (and its schema).

---
'@embedpdf/engine-core': minor
---

Permission fixes:
- **Widgets are form design.** Creating, changing, moving or deleting a widget through the annotation calls takes `doc.forms.modify`. The `annotations:…` permissions never apply to widgets, and a widget patch can't set `groupId`. `allowsAnnotation('update' | 'delete', widget)` answers the same way: `AnnotationOwner` gains `subtype`.
- **Page pictures draw what the caller may read.** Left out, `includeAnnotations` draws the annotations when the caller may read them (`doc.annotate.read`), and `includeFormFields` the form fields when they may read the form. Asking for either when the caller may not read it is refused with `Forbidden`, naming the option. The new `resolvePageLayers` helper applies this rule.
- **Cloud pictures and permissions.** Cloud pictures with annotations need `doc.annotate.read`, and they draw no form fields; the render token loses `formFields`.
- `runAppearanceStatesConformance` takes `pageRendersDrawFormFields`.

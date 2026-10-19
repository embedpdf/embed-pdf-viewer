---
'@embedpdf/engine-services': minor
---

Serve the `document.fonts.list`, `document.fonts.resolve` and `document.fonts.program` worker requests: every font the document holds, wherever it sits (form resources, page and form XObject resources, patterns, soft masks, Type 3 resources and annotation appearances), with what each program is and whether new text can be written with it.

A free text, a widget or a form field can name a font the document holds whole by its name. The write uses the document's own program instead of embedding another; a font that can't be chosen (a subset, a font the document only names, a preview-and-print licence, a Type 1, CFF or Type 3 program, or one without a Unicode cmap) is refused with `InvalidArg` and `details.restrictions`. A widget's or a box's `fontFamily` reads back by that name.

A write that draws characters no font has reports them in `meta.missingCharacters`.

Fix `forms.create` and `forms.addWidget` refusing a widget whose `fontFamily` names a registered font.

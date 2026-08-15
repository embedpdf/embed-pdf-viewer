# @embedpdf/plugin-redaction

## 3.0.0-next.4

### Patch Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Preserves oriented selection quads through text-redaction marks, previews, and native apply so rotated, sheared, and mirrored text can be redacted without expanding the mark to its axis-aligned bounds.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt redaction workflow. It manages pending redaction marks, estimates affected content, and applies destructive redaction through the document engine while leaving mark creation to the annotation system.

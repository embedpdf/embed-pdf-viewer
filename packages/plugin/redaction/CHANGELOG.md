# @embedpdf/plugin-redaction

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for the redaction token, state, pending-item, and capability protocols without destructive-apply plugin wiring.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add `canMark()` for redaction annotation creation and make `canApply()` mirror
  every capability required by destructive redaction. Unauthorized selection
  queueing is now rejected before creating marks.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

### Patch Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Preserves oriented selection quads through text-redaction marks, previews, and native apply so rotated, sheared, and mirrored text can be redacted without expanding the mark to its axis-aligned bounds.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt redaction workflow. It manages pending redaction marks, estimates affected content, and applies destructive redaction through the document engine while leaving mark creation to the annotation system.

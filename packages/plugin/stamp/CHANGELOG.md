# @embedpdf/plugin-stamp

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add persistent library kinds and filtering so stamps, signatures, and custom collections can share the library system. Support renaming and recategorizing libraries, authoring marks from drawn strokes, typed text, images, or PDF pages, and querying the currently armed asset for signature-field placement.

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for stamp-library tokens, assets, previews, configuration, and capability types without import, render, or plugin wiring.

### Patch Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Dynamic stamp evaluation constructs its OWN standalone realm per detached stamp-asset document (`StampScriptingOptions` — the opt-in and script observers stay stamp-config; the viewer document's shared host is never involved).

## 3.0.0-next.10

## 3.0.0-next.9

### Patch Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Update canonical stamp-library import and append flows for the required
  `pages.insert` and `pages.extract` engine operations, removing obsolete
  optional-feature checks.

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces reusable PDF stamp libraries. It imports PDF pages as vector stamp assets, generates previews, supports opt-in dynamic stamps, and places selected stamps through the annotation plugin's tool flow.

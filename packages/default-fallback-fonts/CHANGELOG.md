# @embedpdf/default-fallback-fonts

## 1.0.1

### Patch Changes

- [#1070](https://github.com/embedpdf/embed-pdf-viewer/pull/1070) by [@bobsingor](https://github.com/bobsingor) – The package's page on npm says what the fonts are and which packages bring them, with the fonts' license notice under it. The notice is a file of the package too, `NOTICE.md`.

## 1.0.0

### Minor Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – Introduces the fonts the engine fills in Hebrew and Arabic with: Noto Sans Hebrew and Noto Naskh Arabic, regular and bold, under the Apache License 2.0. `loadFallbackFont(key)` from `@embedpdf/default-fallback-fonts/library` loads one font's TrueType bytes as a lazy module of your build, and `DEFAULT_FALLBACK_FONTS` lists their keys, faces and files; the `.ttf` files are exported too.

## 1.0.0-next.1

### Minor Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – Introduces the fonts the engine fills in Hebrew and Arabic with: Noto Sans Hebrew and Noto Naskh Arabic, regular and bold, under the Apache License 2.0. `loadFallbackFont(key)` from `@embedpdf/default-fallback-fonts/library` loads one font's TrueType bytes as a lazy module of your build, and `DEFAULT_FALLBACK_FONTS` lists their keys, faces and files; the `.ttf` files are exported too.

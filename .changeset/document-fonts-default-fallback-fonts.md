---
'@embedpdf/default-fallback-fonts': minor
---

Introduces the fonts the engine fills in Hebrew and Arabic with: Noto Sans Hebrew and Noto Naskh Arabic, regular and bold, under the Apache License 2.0. `loadFallbackFont(key)` from `@embedpdf/default-fallback-fonts/library` loads one font's TrueType bytes as a lazy module of your build, and `DEFAULT_FALLBACK_FONTS` lists their keys, faces and files; the `.ttf` files are exported too.

---
'@embedpdf/plugin-i18n': minor
---

A fallback language in `loaders` now loads at the start, and a language shows once it and the fallback language are in, so a lazy fallback language no longer shows keys in place of its strings. Until then the fallback language shows, or, while that loads too, the first language in `locales`. A language in both `locales` and `loaders` shows its `locales` strings until its loader has run, and the loader's language then replaces them. When the fallback language can't load, `onLocaleLoadFailed` fires and languages show without it.

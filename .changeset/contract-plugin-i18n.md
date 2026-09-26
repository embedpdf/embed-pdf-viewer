---
'@embedpdf/plugin-i18n': minor
---

The i18n plugin now follows the 3.0 public contract: `getLocale` (was `locale`), `getDirection` (was `dir`), `listLocales` (was `locales`), `getLoadingLocale` (was `loading`), `hasKey` (new), `setLocale` returns a promise that settles when the locale is usable, `registerLocale` returns a remover, `addTranslations` merges keys into a pack, and `onLocaleChanged` / `onLocaleLoadFailed` are event hooks. The package gains `./contract/host` and `./internal` entries.

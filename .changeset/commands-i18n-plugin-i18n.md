---
'@embedpdf/plugin-i18n': minor
---

The i18n plugin has settings: `i18nPlugin({ locale, fallbackLocale, locales, loaders })` registers them, and `updateSettings()` changes them while the app runs (a new `locale` switches to it, new `locales` are added). `i18nState` declares the state a UI shows: `locale`, `direction`, `locales` and `loading`. A language says how it reads with `direction: 'rtl'` (was `dir`), and so does `LocaleInfo`. The plugin ships EmbedPDF's own strings, the standard commands' labels, in English, Dutch, German, French, Spanish, Simplified Chinese, Swedish and Japanese, under the app's own strings. A start language still to load now shows the fallback language until it arrives, and `getLocale()` says so. `setLocale()` takes a signal. `translate` and `interpolate` are no longer exported.

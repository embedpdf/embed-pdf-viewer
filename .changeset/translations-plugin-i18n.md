---
'@embedpdf/plugin-i18n': minor
---

Dotted translation keys work: `{ 'review.reject': 'Reject' }` is the same as `{ review: { reject: 'Reject' } }`, in `addTranslations()`, `registerLocale()`, the startup `locales` and packs from `loaders`. A dotted key used to be stored as it was and never matched.

`addTranslations()` also works for a language in `loaders` that hasn't loaded yet: the strings wait, and go in on top of the pack's own strings when it loads. A code that is neither registered nor has a loader still throws `not-found`.

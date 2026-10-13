---
'@embedpdf/plugin-i18n': minor
---

`t(key, { fallbackKey })` reads another key in each language that has no string for `key`, before it tries the fallback language: a specific key in front of a general one. `t('review:approve', { fallbackKey: 'commands.approve' })` shows a language's `review:approve`, else that same language's `commands.approve`, and only then the fallback language's. A missing-key warning names both keys.

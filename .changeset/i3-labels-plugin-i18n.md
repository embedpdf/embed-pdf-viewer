---
'@embedpdf/plugin-i18n': minor
---

`negotiateLocale` matches a language only within the script it's written in (`Intl.Locale#maximize`): `zh-TW` and `zh-HK` are Traditional Chinese, so they no longer get `zh-CN` (Simplified) and fall back until a Traditional language is there; `zh` and `zh-SG` still get `zh-CN`. A tag whose script the platform can't tell matches by its language, as before. EmbedPDF's own strings follow the same rule.

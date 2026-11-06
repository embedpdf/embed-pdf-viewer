---
'@embedpdf/viewer': minor
---

`strings` takes a language's words as a function too, such as `sv: () => import('./sv.json')`: they load the first time the viewer shows that language, which shows once they're in. `plugins.i18n.fallbackLocale` sets the fallback language, one of the viewer's or one of yours: the language a browser gets when the viewer has none of its languages, and where every word the current language doesn't have comes from. It loads at the start. `plugins.i18n` takes only `fallbackLocale` now; the languages are `locale` and `strings`, and other keys are left out with a warning. The viewer's English words ship as `@embedpdf/viewer/strings/en.json`, to start a translation from. A download is saved under the document's name instead of `document.pdf`.

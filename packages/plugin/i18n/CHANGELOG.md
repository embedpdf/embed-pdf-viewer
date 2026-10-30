# @embedpdf/plugin-i18n

## 3.0.0-next.19

### Minor Changes

- [#920](https://github.com/embedpdf/embed-pdf-viewer/pull/920) by [@bobsingor](https://github.com/bobsingor) – Labels for the `tool:zoom` command (`commands.tool.zoom`) in all eight languages.

## 3.0.0-next.18

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `I18nState`, what `i18nState` reads and `useI18nState()` returns, the State table of the translations page with a comment on each field. Published types now name it instead of spelling out its fields.

## 3.0.0-next.16

### Patch Changes

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – EmbedPDF's strings include `outline.untitled`, the title of a new outline item, in all eight languages.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The i18n plugin has settings: `i18nPlugin({ locale, fallbackLocale, locales, loaders })` registers them, and `updateSettings()` changes them while the app runs (a new `locale` switches to it, new `locales` are added). `i18nState` declares the state a UI shows: `locale`, `direction`, `locales` and `loading`. A language says how it reads with `direction: 'rtl'` (was `dir`), and so does `LocaleInfo`. The plugin ships EmbedPDF's own strings, the standard commands' labels, in English, Dutch, German, French, Spanish, Simplified Chinese, Swedish and Japanese, under the app's own strings. A start language still to load now shows the fallback language until it arrives, and `getLocale()` says so. `setLocale()` takes a signal. `translate` and `interpolate` are no longer exported.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The i18n plugin now follows the 3.0 public contract: `getLocale` (was `locale`), `getDirection` (was `dir`), `listLocales` (was `locales`), `getLoadingLocale` (was `loading`), `hasKey` (new), `setLocale` returns a promise that settles when the locale is usable, `registerLocale` returns a remover, `addTranslations` merges keys into a pack, and `onLocaleChanged` / `onLocaleLoadFailed` are event hooks. The package gains `./contract/host` and `./internal` entries.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `negotiateLocale` matches a language only within the script it's written in (`Intl.Locale#maximize`): `zh-TW` and `zh-HK` are Traditional Chinese, so they no longer get `zh-CN` (Simplified) and fall back until a Traditional language is there; `zh` and `zh-SG` still get `zh-CN`. A tag whose script the platform can't tell matches by its language, as before. EmbedPDF's own strings follow the same rule.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `getTranslator()` for render code that needs a stable translation function
  until the active locale or translations change. Keep locale registration and
  lazy loading reactive under the updated plugin state model.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Dotted translation keys work: `{ 'review.reject': 'Reject' }` is the same as `{ review: { reject: 'Reject' } }`, in `addTranslations()`, `registerLocale()`, the startup `locales` and packs from `loaders`. A dotted key used to be stored as it was and never matched.

  `addTranslations()` also works for a language in `loaders` that hasn't loaded yet: the strings wait, and go in on top of the pack's own strings when it loads. A code that is neither registered nor has a loader still throws `not-found`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `t(key, { fallbackKey })` reads another key in each language that has no string for `key`, before it tries the fallback language: a specific key in front of a general one. `t('review:approve', { fallbackKey: 'commands.approve' })` shows a language's `review:approve`, else that same language's `commands.approve`, and only then the fallback language's. A missing-key warning names both keys.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The plugin's definition takes its types from its token, state and settings instead of type arguments. It declares no settings of its own, so its definition's settings type is `NoSettings`.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for the translation token, locale vocabulary, and capability types without i18n plugin wiring.

## 3.0.0-next.10

## 3.0.0-next.9

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

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces workspace-scoped internationalization for EmbedPDF. It provides reactive locale state, BCP-47 negotiation, pure translation lookup, and lazy locale-pack loading before or after a document engine is available.

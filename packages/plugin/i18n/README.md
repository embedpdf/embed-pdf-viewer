<!-- Generated from docs/content/headless/ui/translations.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/plugin-i18n

Translations for EmbedPDF: your viewer's UI in the user's language.

This plugin comes with each EmbedPDF framework package. Import it from the one you use:

| Framework | Import from | Docs |
| :-------- | :---------- | :--- |
| React   | `@embedpdf/react/i18n`   | [Translations](https://www.embedpdf.com/docs/headless/react/ui/translations)   |
| Vue     | `@embedpdf/vue/i18n`     | [Translations](https://www.embedpdf.com/docs/headless/vue/ui/translations)     |
| Svelte  | `@embedpdf/svelte/i18n`  | [Translations](https://www.embedpdf.com/docs/headless/svelte/ui/translations)  |
| Angular | `@embedpdf/angular/i18n` | [Translations](https://www.embedpdf.com/docs/headless/angular/ui/translations) |

## In React

The translations plugin holds your viewer's text in every language you support, and switches between
them while the app runs. Register it with the user's language:

**`i18n-plugin.tsx`**

```tsx
import { i18nPlugin, negotiateLocale } from '@embedpdf/react/i18n';
import en from './locales/en';

const locale = negotiateLocale(['en', 'nl', 'de'], navigator.languages) ?? 'en';

export const plugins = [
  /* … */
  i18nPlugin({
    locale,
    locales: [{ code: 'en', name: 'English', translations: en }],
    loaders: {
      nl: () => import('./locales/nl').then((module) => module.default),
      de: () => import('./locales/de').then((module) => module.default),
    },
  }),
];
```

Then translate with `useT()`:

**`save-button.tsx`**

```tsx
import { useT } from '@embedpdf/react/i18n';

export function SaveButton() {
  const t = useT();
  return <button>{t('toolbar.save')}</button>;
}
```

`negotiateLocale` picks the best language you have for what the browser asks, such as `nl` for a
browser set to `nl-BE`, within the script it's written in: `zh-TW` doesn't get `zh-CN`, since
Taiwan writes Traditional Chinese and `zh-CN` is Simplified. A language in `loaders` is loaded the first time someone switches to it, so
your bundle carries only the one you start with. A fallback language in `loaders` loads at the
start, and a language shows once it and the fallback language are in.

## License

Apache-2.0

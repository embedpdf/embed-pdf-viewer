<script lang="ts">
  import { i18nPlugin, negotiateLocale } from '@embedpdf/svelte/i18n';
  import { Viewer } from '@embedpdf/svelte/runtime';
  import en from './locales/en';
  import { engine } from './pdf';

  const locale = negotiateLocale(['en', 'nl', 'de'], navigator.languages) ?? 'en';

  const plugins = [
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
</script>

<Viewer {engine} {plugins}>
  <!-- your toolbar and pages -->
</Viewer>

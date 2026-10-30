<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { commandsPlugin, standardCommands } from '@embedpdf/svelte/commands';
  import { i18nPlugin, type Locale } from '@embedpdf/svelte/i18n';
  import { cloudEngine } from '@cloudpdf/engine';
  import ViewerRoot from './ViewerRoot.svelte';

  import '../rtl.css';

  const engine = cloudEngine();

  const en: Locale = {
    code: 'en',
    name: 'English',
    translations: { app: { title: 'The guide', switchTo: 'العربية' } },
  };
  // Arabic reads right to left. The standard commands have no Arabic labels, so the app gives
  // them, under the same keys.
  const ar: Locale = {
    code: 'ar',
    name: 'العربية',
    direction: 'rtl',
    translations: {
      app: { title: 'الدليل', switchTo: 'English' },
      commands: {
        page: { previous: 'الصفحة السابقة', next: 'الصفحة التالية' },
        zoom: { in: 'تكبير', out: 'تصغير' },
      },
    },
  };

  const plugins = [
    stagePlugin(),
    renderPlugin(),
    commandsPlugin({ commands: standardCommands }),
    i18nPlugin({ locale: 'ar', locales: [en, ar] }),
  ];

  const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">…</p>
    {/snippet}
    <ViewerRoot />
  </DocumentGate>
</Viewer>

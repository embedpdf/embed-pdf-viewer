<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { renderPlugin } from '@embedpdf/svelte/render';
  import { stagePlugin } from '@embedpdf/svelte/stage';
  import { commandsPlugin, standardCommands } from '@embedpdf/svelte/commands';
  import { i18nPlugin, type Locale } from '@embedpdf/svelte/i18n';
  import { localEngine } from '@embedpdf/engine';
  import ViewerRoot from './ViewerRoot.svelte';

  import '../rtl.css';

  const engine = localEngine();

  const en: Locale = {
    code: 'en',
    name: 'English',
    translations: { app: { title: 'The ebook', switchTo: 'العربية' } },
  };
  // Arabic reads right to left. The standard commands have no Arabic labels, so the app gives
  // them, under the same keys.
  const ar: Locale = {
    code: 'ar',
    name: 'العربية',
    direction: 'rtl',
    translations: {
      app: { title: 'الكتاب الإلكتروني', switchTo: 'English' },
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

  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">…</p>
    {/snippet}
    <ViewerRoot />
  </DocumentGate>
</Viewer>

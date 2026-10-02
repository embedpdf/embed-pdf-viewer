<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { commandsPlugin, standardCommands } from '@embedpdf/svelte/commands';
  import { i18nPlugin, type Locale } from '@embedpdf/svelte/i18n';
  import { localEngine } from '@embedpdf/engine';
  import CommandButton from './CommandButton.svelte';
  import LanguagePicker from './LanguagePicker.svelte';
  import PageCount from './PageCount.svelte';

  import '../basic.css';

  const engine = localEngine();

  // Your strings. The buttons' labels are the standard commands', which come translated.
  const en: Locale = {
    code: 'en',
    name: 'English',
    translations: {
      app: { language: 'Language', pages: { one: '{count} page', other: '{count} pages' } },
    },
  };
  const nl: Locale = {
    code: 'nl',
    name: 'Nederlands',
    translations: {
      app: { language: 'Taal', pages: { one: '{count} pagina', other: "{count} pagina's" } },
    },
  };

  const plugins = [
    stagePlugin(),
    renderPlugin(),
    commandsPlugin({ commands: standardCommands }),
    i18nPlugin({
      locale: 'nl',
      locales: [en, nl],
      // Loaded the first time someone picks them; in your app, `() => import('./locales/de')`.
      loaders: {
        de: async () => ({
          code: 'de',
          name: 'Deutsch',
          translations: {
            app: { language: 'Sprache', pages: { one: '{count} Seite', other: '{count} Seiten' } },
          },
        }),
        ja: async () => ({
          code: 'ja',
          name: '日本語',
          translations: { app: { language: '言語', pages: { other: '{count} ページ' } } },
        }),
      },
    }),
  ];

  // [!doc-source ebook]
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">…</p>
    {/snippet}
    <div class="toolbar">
      <LanguagePicker />
      <CommandButton id="page:previous" />
      <CommandButton id="page:next" />
      <CommandButton id="zoom:in" />
      <CommandButton id="document:print" />
      <PageCount />
    </div>
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>

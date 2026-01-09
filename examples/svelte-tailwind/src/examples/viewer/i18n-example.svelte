<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type I18nPlugin,
    type I18nCapability,
  } from '@embedpdf/svelte-pdf-viewer';
  import { ChevronDown } from 'lucide-svelte';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let i18n = $state<I18nCapability | null>(null);

  const locales = [
    { code: 'en', name: 'English' },
    { code: 'nl', name: 'Dutch' },
    { code: 'de', name: 'German' },
    { code: 'fr', name: 'French' },
    { code: 'es', name: 'Spanish' },
    { code: 'zh-CN', name: 'Chinese' },
  ];

  let currentLocale = $state('en');
  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const i18nCapability = registry.getPlugin<I18nPlugin>('i18n')?.provides();

    if (i18nCapability) {
      i18n = i18nCapability;
      const cleanup = i18nCapability.onLocaleChange((event) => {
        currentLocale = event.currentLocale;
      });
      cleanups.push(cleanup);
    }
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  onDestroy(() => {
    cleanups.forEach((cleanup) => cleanup());
  });

  const handleLocaleChange = (newLocale: string) => {
    currentLocale = newLocale;
    i18n?.setLocale(newLocale);
  };
</script>

<div class="flex flex-col gap-4">
  <!-- Controls -->
  <div
    class="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <label class="text-sm font-medium text-gray-700 dark:text-gray-300"> Language: </label>
    <div class="relative">
      <select
        value={currentLocale}
        onchange={(e) => handleLocaleChange((e.target as HTMLSelectElement).value)}
        class="cursor-pointer appearance-none rounded-md border-0 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600"
      >
        {#each locales as l (l.code)}
          <option value={l.code}>{l.name}</option>
        {/each}
      </select>
      <ChevronDown
        size={14}
        class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-300"
      />
    </div>
    <span class="text-xs text-gray-500 dark:text-gray-400">
      Changing language updates all tooltips, menus, and labels instantly.
    </span>
  </div>

  <!-- Viewer Container -->
  <div
    class="h-[600px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
  >
    <PDFViewer
      oninit={handleInit}
      onready={handleReady}
      config={{
        src: 'https://snippet.embedpdf.com/ebook.pdf',
        theme: { preference: themePreference },
        i18n: {
          defaultLocale: 'en',
        },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>

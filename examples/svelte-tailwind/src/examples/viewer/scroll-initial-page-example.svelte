<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type ScrollPlugin,
  } from '@embedpdf/svelte-pdf-viewer';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let status = $state('Loading...');

  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const scrollCapability = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
    if (!scrollCapability) return;

    cleanups.push(
      scrollCapability.onLayoutReady((event) => {
        if (event.documentId === 'ebook' && event.isInitial) {
          status = 'Layout ready! Jumping to page 3...';

          setTimeout(() => {
            scrollCapability.forDocument('ebook').scrollToPage({
              pageNumber: 3,
              behavior: 'instant',
            });
            status = 'Scrolled to Page 3';
          }, 0);
        }
      }),
    );
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  onDestroy(() => {
    cleanups.forEach((cleanup) => cleanup());
  });
</script>

<div class="flex flex-col gap-4">
  <!-- Status Bar -->
  <div
    class="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="relative flex h-2 w-2">
      <span
        class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
      ></span>
      <span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
    </div>
    <span class="font-mono text-sm text-gray-700 dark:text-gray-300">
      {status}
    </span>
  </div>

  <!-- Viewer -->
  <div
    class="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
  >
    <PDFViewer
      oninit={handleInit}
      onready={handleReady}
      config={{
        theme: { preference: themePreference },
        documentManager: {
          initialDocuments: [
            {
              url: 'https://snippet.embedpdf.com/ebook.pdf',
              documentId: 'ebook',
            },
          ],
        },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>

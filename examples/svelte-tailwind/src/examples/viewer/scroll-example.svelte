<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type ScrollPlugin,
    type ScrollCapability,
  } from '@embedpdf/svelte-pdf-viewer';
  import { ArrowLeft, ArrowRight } from 'lucide-svelte';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let scroll = $state<ScrollCapability | null>(null);

  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const scrollCapability = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
    if (!scrollCapability) return;

    scroll = scrollCapability;

    cleanups.push(
      scrollCapability.onLayoutReady((event) => {
        currentPage = event.pageNumber;
        totalPages = event.totalPages;
      }),
    );

    cleanups.push(
      scrollCapability.onPageChange((event) => {
        currentPage = event.pageNumber;
        totalPages = event.totalPages;
      }),
    );
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  onDestroy(() => {
    cleanups.forEach((cleanup) => cleanup());
  });

  const getDoc = () => scroll?.forDocument('ebook');
</script>

<div class="flex flex-col gap-4">
  <!-- External Controls -->
  <div
    class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <!-- Navigation -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={() => getDoc()?.scrollToPreviousPage()}
        disabled={currentPage <= 1}
        class="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
      >
        <ArrowLeft size={20} />
      </button>
      <span class="font-mono text-sm font-medium">
        Page {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        onclick={() => getDoc()?.scrollToNextPage()}
        disabled={currentPage >= totalPages}
        class="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
      >
        <ArrowRight size={20} />
      </button>
    </div>
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
        scroll: {
          defaultPageGap: 20,
        },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>

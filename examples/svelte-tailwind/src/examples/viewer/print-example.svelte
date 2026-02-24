<script lang="ts">
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type PrintPlugin,
    type PrintScope,
  } from '@embedpdf/svelte-pdf-viewer';
  import { Printer } from 'lucide-svelte';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let docPrint = $state<PrintScope | null>(null);
  let isPrinting = $state(false);

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const printPlugin = registry.getPlugin<PrintPlugin>('print')?.provides();
    if (printPlugin) {
      docPrint = printPlugin.forDocument('ebook');
    }
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  const handlePrint = () => {
    if (isPrinting || !docPrint) return;

    isPrinting = true;

    docPrint.print().wait(
      () => (isPrinting = false),
      (err) => {
        console.error('Print failed', err);
        isPrinting = false;
      },
    );
  };
</script>

<div class="flex flex-col gap-4">
  <!-- External Controls -->
  <div
    class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex items-center gap-4">
      <button
        type="button"
        onclick={handlePrint}
        disabled={isPrinting}
        class="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-700"
      >
        <Printer size={18} />
        {isPrinting ? 'Preparing...' : 'Print Document'}
      </button>

      {#if isPrinting}
        <span class="animate-pulse text-sm text-gray-500 dark:text-gray-400">
          Generating print version...
        </span>
      {/if}
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
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>

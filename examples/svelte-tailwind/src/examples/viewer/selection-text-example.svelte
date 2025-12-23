<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type SelectionPlugin,
    type SelectionScope,
    ignore,
  } from '@embedpdf/svelte-pdf-viewer';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let docSelection = $state<SelectionScope | null>(null);
  let selectedText = $state('');
  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const selectionPlugin = registry.getPlugin<SelectionPlugin>('selection')?.provides();
    const selectionScope = selectionPlugin?.forDocument('ebook');

    if (selectionScope) {
      docSelection = selectionScope;

      const cleanup = selectionScope.onSelectionChange((currentSelection) => {
        if (currentSelection) {
          selectionScope.getSelectedText().wait((lines) => {
            selectedText = lines.join(' ');
          }, ignore);
        } else {
          selectedText = '';
        }
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
</script>

<div class="flex flex-col gap-4">
  <!-- Text Display -->
  <div
    class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <span class="text-xs font-medium uppercase tracking-wider text-gray-500"> Selected Text </span>
    <div class="min-h-[3rem] text-sm text-gray-800 dark:text-gray-200">
      {#if selectedText}
        {selectedText}
      {:else}
        <span class="italic text-gray-400"> Select text in the PDF to see it here... </span>
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

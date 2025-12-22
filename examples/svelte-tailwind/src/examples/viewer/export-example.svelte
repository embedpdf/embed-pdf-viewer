<script lang="ts">
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type ExportPlugin,
    type ExportScope,
  } from '@embedpdf/svelte-pdf-viewer';
  import { Download, CloudUpload, Loader2, Check } from 'lucide-svelte';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let exportScope = $state<ExportScope | null>(null);
  let isSaving = $state(false);
  let saveStatus = $state<'idle' | 'success'>('idle');

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const exportPlugin = registry.getPlugin<ExportPlugin>('export')?.provides();
    if (exportPlugin) {
      exportScope = exportPlugin.forDocument('ebook');
    }
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  const handleDownload = () => {
    exportScope?.download();
  };

  const handleSaveToServer = async () => {
    if (!exportScope) return;

    isSaving = true;

    const arrayBuffer = await exportScope.saveAsCopy().toPromise();

    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const file = new File([blob], 'saved-document.pdf');

    // Mock Upload
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log(`Successfully prepared ${file.size} bytes for upload.`);
    saveStatus = 'success';
    setTimeout(() => (saveStatus = 'idle'), 3000);
    isSaving = false;
  };
</script>

<div class="flex flex-col gap-4">
  <!-- External Controls -->
  <div
    class="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <button
      type="button"
      onclick={handleDownload}
      class="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
    >
      <Download size={16} />
      Download PDF
    </button>

    <div class="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>

    <button
      type="button"
      onclick={handleSaveToServer}
      disabled={isSaving}
      class="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
    >
      {#if isSaving}
        <Loader2 size={16} class="animate-spin" />
      {:else if saveStatus === 'success'}
        <Check size={16} />
      {:else}
        <CloudUpload size={16} />
      {/if}
      {isSaving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save to Server'}
    </button>
  </div>

  <!-- Viewer -->
  <div
    class="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
  >
    <PDFViewer
      oninit={handleInit}
      onready={handleReady}
      config={{
        documentManager: {
          initialDocuments: [
            {
              url: 'https://snippet.embedpdf.com/ebook.pdf',
              documentId: 'ebook',
            },
          ],
        },
        export: {
          defaultFileName: 'my-ebook.pdf',
        },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>

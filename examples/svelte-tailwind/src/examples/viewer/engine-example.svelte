<script lang="ts">
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type DocumentManagerPlugin,
  } from '@embedpdf/svelte-pdf-viewer';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let registry = $state<PluginRegistry | null>(null);
  let isReady = $state(false);
  let isLoading = $state(false);
  let metadata = $state<{
    title?: string | null;
    author?: string | null;
    subject?: string | null;
    creator?: string | null;
    producer?: string | null;
    creationDate?: Date | null;
    modificationDate?: Date | null;
  } | null>(null);
  let pageCount = $state<number | null>(null);

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (r: PluginRegistry) => {
    registry = r;
    isReady = true;
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  const getDocumentInfo = async () => {
    if (!registry) return;

    isLoading = true;

    try {
      const documentManager = registry
        .getPlugin<DocumentManagerPlugin>('document-manager')
        ?.provides();
      const engine = registry.getEngine();

      if (engine && documentManager) {
        const document = documentManager.getActiveDocument();
        if (document) {
          pageCount = document.pageCount;
          const meta = await engine.getMetadata(document).toPromise();
          metadata = meta;
        }
      }
    } catch (error) {
      console.error('Error getting document info:', error);
    } finally {
      isLoading = false;
    }
  };

  const formatDate = (date?: Date | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
</script>

<div class="flex flex-col gap-4">
  <!-- Controls -->
  <div
    class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex flex-wrap items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="inline-block h-2 w-2 rounded-full {isReady ? 'bg-green-500' : 'bg-yellow-500'}"
        ></span>
        <span class="text-sm text-gray-600 dark:text-gray-300">
          {isReady ? 'Engine ready' : 'Loading...'}
        </span>
      </div>

      <button
        type="button"
        onclick={getDocumentInfo}
        disabled={!isReady || isLoading}
        class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? 'Loading...' : 'Get Document Info'}
      </button>
    </div>

    <!-- Metadata Display -->
    {#if metadata}
      <div
        class="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-gray-600 dark:bg-gray-700 sm:grid-cols-3"
      >
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Title
          </span>
          <p class="truncate text-gray-900 dark:text-gray-100">
            {metadata.title || '—'}
          </p>
        </div>
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Author
          </span>
          <p class="truncate text-gray-900 dark:text-gray-100">
            {metadata.author || '—'}
          </p>
        </div>
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Pages
          </span>
          <p class="text-gray-900 dark:text-gray-100">
            {pageCount ?? '—'}
          </p>
        </div>
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Creator
          </span>
          <p class="truncate text-gray-900 dark:text-gray-100">
            {metadata.creator || '—'}
          </p>
        </div>
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Created
          </span>
          <p class="text-gray-900 dark:text-gray-100">
            {formatDate(metadata.creationDate)}
          </p>
        </div>
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Modified
          </span>
          <p class="text-gray-900 dark:text-gray-100">
            {formatDate(metadata.modificationDate)}
          </p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Viewer Container -->
  <div
    class="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
  >
    <PDFViewer
      oninit={handleInit}
      onready={handleReady}
      config={{
        src: 'https://snippet.embedpdf.com/ebook.pdf',
        theme: { preference: themePreference },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>

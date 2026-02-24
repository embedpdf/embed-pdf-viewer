<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type DocumentManagerPlugin,
    type DocumentManagerCapability,
  } from '@embedpdf/svelte-pdf-viewer';
  import { FileUp, Globe, Layers } from 'lucide-svelte';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let docManager = $state<DocumentManagerCapability | null>(null);
  let activeDocId = $state<string | null>(null);
  let docList = $state<{ id: string; name: string }[]>([]);

  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  const handleReady = (registry: PluginRegistry) => {
    const dm = registry.getPlugin<DocumentManagerPlugin>('document-manager')?.provides();
    if (!dm) return;

    docManager = dm;

    const updateList = () => {
      const docs = dm.getOpenDocuments();
      docList = docs.map((d) => ({ id: d.id, name: d.name || 'Untitled' }));
      activeDocId = dm.getActiveDocumentId();
    };

    cleanups.push(dm.onDocumentOpened(updateList));
    cleanups.push(dm.onDocumentClosed(updateList));
    cleanups.push(
      dm.onActiveDocumentChanged((e) => {
        activeDocId = e.currentDocumentId;
      }),
    );

    updateList();
  };

  onDestroy(() => {
    cleanups.forEach((cleanup) => cleanup());
  });

  const handleUrlLoad = () => {
    docManager?.openDocumentUrl({
      url: 'https://snippet.embedpdf.com/ebook.pdf',
      documentId: 'ebook-demo',
    });
  };

  const handleFileUpload = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();

    docManager?.openDocumentBuffer({
      buffer,
      name: file.name,
      autoActivate: true,
    });

    target.value = '';
  };

  const handleSwitch = (id: string) => {
    docManager?.setActiveDocument(id);
  };
</script>

<div class="flex flex-col gap-4">
  <!-- External Control Panel -->
  <div
    class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <!-- Load Actions -->
    <div class="flex gap-2">
      <button
        type="button"
        onclick={handleUrlLoad}
        class="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-600"
      >
        <Globe size={16} /> Load URL
      </button>

      <label
        class="flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-600"
      >
        <FileUp size={16} /> Upload Local
        <input type="file" class="hidden" accept=".pdf" onchange={handleFileUpload} />
      </label>
    </div>

    <!-- Document Switcher -->
    <div class="flex items-center gap-2">
      <Layers size={16} class="text-gray-500" />
      <select
        value={activeDocId || ''}
        onchange={(e) => handleSwitch((e.target as HTMLSelectElement).value)}
        class="rounded-md border-gray-300 bg-white py-1.5 text-sm dark:bg-gray-700"
        disabled={docList.length === 0}
      >
        <option value="" disabled>Select Document...</option>
        {#each docList as doc (doc.id)}
          <option value={doc.id}>{doc.name}</option>
        {/each}
      </select>
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
        tabBar: 'always',
        documentManager: {
          maxDocuments: 5,
        },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type PanPlugin,
    type PanScope,
  } from '@embedpdf/svelte-pdf-viewer';
  import { Hand, MousePointer2 } from 'lucide-svelte';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let docPan = $state<PanScope | null>(null);
  let isPanMode = $state(false);
  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const panPlugin = registry.getPlugin<PanPlugin>('pan')?.provides();
    const panScope = panPlugin?.forDocument('pan-doc');

    if (panScope) {
      docPan = panScope;
      isPanMode = panScope.isPanMode();

      const cleanup = panScope.onPanModeChange((isActive) => {
        isPanMode = isActive;
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

  const togglePanMode = () => {
    docPan?.togglePan();
  };
</script>

<div class="flex flex-col gap-4">
  <!-- External Controls -->
  <div
    class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <span class="px-2 text-sm font-medium text-gray-600 dark:text-gray-300">
      Interaction Mode:
    </span>
    <button
      type="button"
      onclick={togglePanMode}
      class="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors {!isPanMode
        ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
        : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'}"
    >
      <MousePointer2 size={16} />
      Select Text
    </button>
    <button
      type="button"
      onclick={togglePanMode}
      class="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors {isPanMode
        ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
        : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'}"
    >
      <Hand size={16} />
      Pan (Hand Tool)
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
        theme: { preference: themePreference },
        pan: {
          defaultMode: 'mobile',
        },
        documentManager: {
          initialDocuments: [
            {
              url: 'https://snippet.embedpdf.com/ebook.pdf',
              documentId: 'pan-doc',
            },
          ],
        },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type AnnotationPlugin,
    type AnnotationCapability,
  } from '@embedpdf/svelte-pdf-viewer';
  import { Highlighter, Pen, Square, MousePointer2 } from 'lucide-svelte';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let annotationCapability = $state<AnnotationCapability | null>(null);
  let activeTool = $state<string | null>(null);
  let lastEvent = $state('Ready');
  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const annotationPlugin = registry.getPlugin<AnnotationPlugin>('annotation')?.provides();

    if (annotationPlugin) {
      annotationCapability = annotationPlugin;

      const cleanupTool = annotationPlugin.onActiveToolChange(({ tool }) => {
        activeTool = tool?.id || null;
      });
      cleanups.push(cleanupTool);

      const cleanupEvents = annotationPlugin.onAnnotationEvent((event) => {
        if (event.type === 'create') {
          lastEvent = `Created annotation on page ${event.pageIndex + 1}`;
        } else if (event.type === 'delete') {
          lastEvent = `Deleted annotation from page ${event.pageIndex + 1}`;
        }
      });
      cleanups.push(cleanupEvents);
    }
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  onDestroy(() => {
    cleanups.forEach((cleanup) => cleanup());
  });

  const setTool = (toolId: string | null) => {
    annotationCapability?.setActiveTool(toolId);
  };
</script>

<div class="flex flex-col gap-4">
  <!-- External Controls -->
  <div
    class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-600 dark:text-gray-300"> Tools: </span>
        <div class="flex gap-1">
          <button
            type="button"
            onclick={() => setTool(null)}
            class="rounded p-2 transition-colors {activeTool === null
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'}"
            title="Select / None"
          >
            <MousePointer2 size={18} />
          </button>
          <button
            type="button"
            onclick={() => setTool('highlight')}
            class="rounded p-2 transition-colors {activeTool === 'highlight'
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'}"
            title="Highlighter"
          >
            <Highlighter size={18} />
          </button>
          <button
            type="button"
            onclick={() => setTool('ink')}
            class="rounded p-2 transition-colors {activeTool === 'ink'
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'}"
            title="Pen (Ink)"
          >
            <Pen size={18} />
          </button>
          <button
            type="button"
            onclick={() => setTool('square')}
            class="rounded p-2 transition-colors {activeTool === 'square'
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'}"
            title="Square"
          >
            <Square size={18} />
          </button>
        </div>
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400">Log: {lastEvent}</div>
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
        annotations: {
          annotationAuthor: 'Guest User',
          selectAfterCreate: true,
        },
        documentManager: {
          initialDocuments: [
            {
              url: 'https://snippet.embedpdf.com/ebook.pdf',
              documentId: 'annotation-doc',
            },
          ],
        },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>

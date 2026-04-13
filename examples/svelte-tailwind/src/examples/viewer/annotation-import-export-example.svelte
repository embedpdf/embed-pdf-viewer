<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type AnnotationPlugin,
    type AnnotationCapability,
    type AnnotationTool,
    type AnnotationTransferItem,
    PdfAnnotationSubtype,
    type PdfStampAnnoObject,
  } from '@embedpdf/svelte-pdf-viewer';
  import {
    Check,
    X,
    Pencil,
    Square,
    Highlighter,
    Type,
    Download,
    Upload,
    Trash2,
    MousePointer2,
  } from 'lucide-svelte';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let annotationApi = $state<AnnotationCapability | null>(null);
  let activeTool = $state<string | null>(null);
  let annotationCount = $state(0);
  let exported: AnnotationTransferItem[] | null = null;
  let hasExported = $state(false);
  let status = $state<string | null>(null);
  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const api = registry.getPlugin<AnnotationPlugin>('annotation')?.provides();
    if (!api) return;

    annotationApi = api;

    api.addTool<AnnotationTool<PdfStampAnnoObject>>({
      id: 'stampCheckmark',
      name: 'Checkmark',
      interaction: { exclusive: true, cursor: 'crosshair' },
      matchScore: () => 0,
      defaults: {
        type: PdfAnnotationSubtype.STAMP,
        imageSrc: '/circle-checkmark.png',
        imageSize: { width: 30, height: 30 },
      },
      behavior: {
        showGhost: true,
        deactivateToolAfterCreate: true,
        selectAfterCreate: true,
      },
    });

    api.addTool<AnnotationTool<PdfStampAnnoObject>>({
      id: 'stampCross',
      name: 'Cross',
      interaction: { exclusive: true, cursor: 'crosshair' },
      matchScore: () => 0,
      defaults: {
        type: PdfAnnotationSubtype.STAMP,
        imageSrc: '/circle-cross.png',
        imageSize: { width: 30, height: 30 },
      },
      behavior: {
        showGhost: true,
        deactivateToolAfterCreate: true,
        selectAfterCreate: true,
      },
    });

    const cleanupTool = api.onActiveToolChange(({ tool }) => {
      activeTool = tool?.id || null;
    });
    cleanups.push(cleanupTool);

    const cleanupEvents = api.onAnnotationEvent((event) => {
      if (event.type === 'create' || event.type === 'delete' || event.type === 'loaded') {
        annotationCount = api.getAnnotations().length;
      }
    });
    cleanups.push(cleanupEvents);

    annotationCount = api.getAnnotations().length;
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  onDestroy(() => {
    cleanups.forEach((cleanup) => cleanup());
  });

  const setTool = (toolId: string | null) => {
    annotationApi?.setActiveTool(toolId);
  };

  const handleExport = () => {
    if (!annotationApi) return;
    annotationApi.exportAnnotations().wait(
      (result) => {
        exported = result;
        hasExported = true;
        status = `Exported ${result.length} annotation${result.length !== 1 ? 's' : ''}`;
      },
      () => {
        status = 'Export failed';
      },
    );
  };

  const handleClear = () => {
    if (!annotationApi) return;
    annotationApi.deleteAllAnnotations();
    status = 'Cleared all annotations';
  };

  const handleImport = () => {
    if (!annotationApi || !exported) return;
    annotationApi.importAnnotations(exported);
    status = `Imported ${exported.length} annotation${exported.length !== 1 ? 's' : ''}`;
  };

  const tools = [
    { id: null, name: 'Select', icon: MousePointer2 },
    { id: 'stampCheckmark', name: 'Checkmark', icon: Check },
    { id: 'stampCross', name: 'Cross', icon: X },
    { id: 'ink', name: 'Pen', icon: Pencil },
    { id: 'square', name: 'Square', icon: Square },
    { id: 'highlight', name: 'Highlight', icon: Highlighter },
    { id: 'freeText', name: 'Text', icon: Type },
  ];
</script>

<div class="flex flex-col gap-4">
  <!-- Toolbar -->
  <div
    class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
  >
    <!-- Annotation tools -->
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Tools
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1">
        {#each tools as tool (tool.id ?? 'select')}
          <button
            type="button"
            onclick={() => setTool(activeTool === tool.id && tool.id !== null ? null : tool.id)}
            class="rounded p-2 transition-colors {activeTool === tool.id
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'}"
            title={tool.name}
          >
            <tool.icon size={16} />
          </button>
        {/each}
      </div>
    </div>

    <!-- Import/Export actions -->
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Import / Export
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={handleExport}
          disabled={annotationCount === 0}
          class="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={14} />
          Export ({annotationCount})
        </button>
        <button
          type="button"
          onclick={handleClear}
          disabled={annotationCount === 0}
          class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={14} />
          Clear All
        </button>
        <button
          type="button"
          onclick={handleImport}
          disabled={!hasExported}
          class="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload size={14} />
          Import{hasExported && exported ? ` (${exported.length})` : ''}
        </button>
      </div>

      {#if status}
        <span class="text-xs text-gray-500 dark:text-gray-400">{status}</span>
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
        annotations: {
          annotationAuthor: 'Guest User',
          selectAfterCreate: true,
        },
        documentManager: {
          initialDocuments: [
            {
              url: 'https://snippet.embedpdf.com/ebook.pdf',
              documentId: 'import-export-doc',
            },
          ],
        },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { AnnotationLayer, useAnnotationCapability } from '@embedpdf/plugin-annotation/svelte';
  import type { AnnotationTransferItem } from '@embedpdf/plugin-annotation';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionLayer } from '@embedpdf/plugin-selection/svelte';
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
  } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  let activeTool = $state<string | null>(null);
  let exported: AnnotationTransferItem[] | null = null;
  let hasExported = $state(false);
  let status = $state<string | null>(null);
  let annotationCount = $state(0);

  const annotationCapability = useAnnotationCapability();
  const annotationApi = $derived(annotationCapability.provides?.forDocument(documentId));

  const tools = [
    { id: 'stampCheckmark', name: 'Checkmark', icon: Check },
    { id: 'stampCross', name: 'Cross', icon: X },
    { id: 'ink', name: 'Pen', icon: Pencil },
    { id: 'square', name: 'Square', icon: Square },
    { id: 'highlight', name: 'Highlight', icon: Highlighter },
    { id: 'freeText', name: 'Text', icon: Type },
  ];

  let unsubscribeToolChange: (() => void) | undefined;
  let unsubscribeStateChange: (() => void) | undefined;

  onMount(() => {
    if (!annotationApi) return;

    unsubscribeToolChange = annotationApi.onActiveToolChange((tool) => {
      activeTool = tool?.id ?? null;
    });

    unsubscribeStateChange = annotationApi.onStateChange((state) => {
      annotationCount = Object.values(state.pages).reduce((sum, uids) => sum + uids.length, 0);
    });
  });

  onDestroy(() => {
    unsubscribeToolChange?.();
    unsubscribeStateChange?.();
  });

  const handleToolClick = (toolId: string) => {
    annotationApi?.setActiveTool(activeTool === toolId ? null : toolId);
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
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  style="user-select: none"
>
  <div
    class="flex flex-col gap-2 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Tools
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        {#each tools as tool (tool.id)}
          <button
            type="button"
            onclick={() => handleToolClick(tool.id)}
            class={[
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
              activeTool === tool.id
                ? 'bg-blue-500 text-white ring-1 ring-blue-600'
                : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
            ].join(' ')}
            title={tool.name}
          >
            <tool.icon size={14} />
            <span class="hidden sm:inline">{tool.name}</span>
          </button>
        {/each}
      </div>
    </div>

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

  <div class="relative h-[450px] sm:h-[550px]">
    {#snippet renderPage(page: RenderPageProps)}
      <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
        <RenderLayer
          {documentId}
          pageIndex={page.pageIndex}
          scale={1}
          class="pointer-events-none"
        />
        <SelectionLayer {documentId} pageIndex={page.pageIndex} />
        <AnnotationLayer {documentId} pageIndex={page.pageIndex} />
      </PagePointerProvider>
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>

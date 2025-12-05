<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { AnnotationLayer, useAnnotationCapability } from '@embedpdf/plugin-annotation/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionLayer } from '@embedpdf/plugin-selection/svelte';
  import { Check, X, Pencil, Square, Highlighter, Trash2 } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  let activeTool = $state<string | null>(null);
  let canDelete = $state(false);

  const annotationCapability = useAnnotationCapability();
  const annotationApi = $derived(annotationCapability.provides?.forDocument(documentId));

  const tools = [
    { id: 'stampCheckmark', name: 'Checkmark', icon: Check },
    { id: 'stampCross', name: 'Cross', icon: X },
    { id: 'ink', name: 'Pen', icon: Pencil },
    { id: 'square', name: 'Square', icon: Square },
    { id: 'highlight', name: 'Highlight', icon: Highlighter },
  ];

  let unsubscribeToolChange: (() => void) | undefined;
  let unsubscribeStateChange: (() => void) | undefined;

  onMount(() => {
    if (!annotationApi) return;

    unsubscribeToolChange = annotationApi.onActiveToolChange((tool) => {
      activeTool = tool?.id ?? null;
    });

    unsubscribeStateChange = annotationApi.onStateChange((state) => {
      canDelete = !!state.selectedUid;
    });
  });

  onDestroy(() => {
    unsubscribeToolChange?.();
    unsubscribeStateChange?.();
  });

  const handleToolClick = (toolId: string) => {
    annotationApi?.setActiveTool(activeTool === toolId ? null : toolId);
  };

  const handleDelete = () => {
    const selection = annotationApi?.getSelectedAnnotation();
    if (selection) {
      annotationApi?.deleteAnnotation(selection.object.pageIndex, selection.object.id);
    }
  };

  const handleDeleteFromMenu = (pageIndex: number, id: string) => {
    annotationApi?.deleteAnnotation(pageIndex, id);
  };
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  style="user-select: none"
>
  <!-- Toolbar -->
  <div
    class="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
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
    <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
    <button
      type="button"
      onclick={handleDelete}
      disabled={!canDelete}
      class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Trash2 size={14} />
      <span class="hidden sm:inline">Delete</span>
    </button>
  </div>

  <!-- PDF Viewer Area -->
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
        <AnnotationLayer {documentId} pageIndex={page.pageIndex}>
          {#snippet selectionMenuSnippet({ selected, context, menuWrapperProps, rect })}
            {#if selected}
              <span style={menuWrapperProps.style} use:menuWrapperProps.action>
                <div
                  class="rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                  style:position="absolute"
                  style:top="{rect.size.height + 8}px"
                  style:pointer-events="auto"
                  style:cursor="default"
                >
                  <div class="flex items-center gap-1 px-2 py-1">
                    <button
                      type="button"
                      onclick={() =>
                        handleDeleteFromMenu(
                          context.annotation.object.pageIndex,
                          context.annotation.object.id,
                        )}
                      class="flex items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-red-400"
                      aria-label="Delete annotation"
                      title="Delete annotation"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </span>
            {/if}
          {/snippet}
        </AnnotationLayer>
      </PagePointerProvider>
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>

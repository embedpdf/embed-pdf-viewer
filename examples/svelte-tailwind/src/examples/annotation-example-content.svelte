<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { type RenderPageProps, Scroller } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { AnnotationLayer, useAnnotationCapability } from '@embedpdf/plugin-annotation/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionLayer } from '@embedpdf/plugin-selection/svelte';

  let activeTool = $state<string | null>(null);
  let canDelete = $state(false);

  const annotationCapability = useAnnotationCapability();

  const tools = [
    { id: 'stampCheckmark', name: 'Checkmark (stamp)' },
    { id: 'stampCross', name: 'Cross (stamp)' },
    { id: 'ink', name: 'Pen' },
    { id: 'square', name: 'Square' },
    { id: 'highlight', name: 'Highlight' },
  ];

  // Subscribe to tool changes
  $effect(() => {
    if (!annotationCapability.provides) return;

    return annotationCapability.provides.onActiveToolChange((tool) => {
      activeTool = tool?.id ?? null;
    });
  });

  // Subscribe to state changes
  $effect(() => {
    if (!annotationCapability.provides) return;

    return annotationCapability.provides.onStateChange((state) => {
      canDelete = !!state.selectedUid;
    });
  });

  const handleToolClick = (toolId: string) => {
    annotationCapability.provides?.setActiveTool(activeTool === toolId ? null : toolId);
  };

  const handleDelete = () => {
    const selection = annotationCapability.provides?.getSelectedAnnotation();
    if (selection) {
      annotationCapability.provides?.deleteAnnotation(
        selection.object.pageIndex,
        selection.object.id,
      );
    }
  };
</script>

{#snippet RenderPageSnippet(page: RenderPageProps)}
  <PagePointerProvider
    pageIndex={page.pageIndex}
    pageWidth={page.width}
    pageHeight={page.height}
    rotation={page.rotation}
    scale={page.scale}
  >
    <RenderLayer pageIndex={page.pageIndex} class="pointer-events-none" />
    <SelectionLayer pageIndex={page.pageIndex} scale={page.scale} />
    <AnnotationLayer
      pageIndex={page.pageIndex}
      scale={page.scale}
      pageWidth={page.width}
      pageHeight={page.height}
      rotation={page.rotation}
    />
  </PagePointerProvider>
{/snippet}

<div style="height: 600px; display: flex; flex-direction: column; user-select: none">
  <div
    class="mb-4 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
  >
    {#each tools as tool (tool.id)}
      <button
        onclick={() => handleToolClick(tool.id)}
        class="rounded-md px-3 py-1 text-sm font-medium transition-colors {activeTool === tool.id
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 hover:bg-gray-200'}"
      >
        {tool.name}
      </button>
    {/each}
    <div class="h-6 w-px bg-gray-200"></div>
    <button
      onclick={handleDelete}
      disabled={!canDelete}
      class="rounded-md bg-red-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-300"
    >
      Delete Selected
    </button>
  </div>
  <div class="flex-grow" style="position: relative">
    <Viewport style="width: 100%; height: 100%; position: absolute; background-color: #f1f3f5">
      <Scroller {RenderPageSnippet} />
    </Viewport>
  </div>
</div>

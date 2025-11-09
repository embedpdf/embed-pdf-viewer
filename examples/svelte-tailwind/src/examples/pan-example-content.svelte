<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { GlobalPointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { usePan } from '@embedpdf/plugin-pan/svelte';

  let { documentId }: { documentId: string } = $props();

  const pan = usePan(() => documentId);
</script>

{#snippet renderPage(page: RenderPageProps)}
  <div style:width={`${page.width}px`} style:height={`${page.height}px`} style:position="relative">
    <RenderLayer {documentId} pageIndex={page.pageIndex} class="pointer-events-none" />
  </div>
{/snippet}

<div style="height: 500px" class="select-none">
  <div class="flex h-full flex-col">
    {#if pan.provides}
      <div
        class="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <button
          onclick={() => pan.provides?.togglePan()}
          class:border-blue-500={pan.isPanning}
          class:bg-blue-100={pan.isPanning}
          class:text-blue-700={pan.isPanning}
          class:border-gray-300={!pan.isPanning}
          class:bg-white={!pan.isPanning}
          class:text-gray-700={!pan.isPanning}
          class:hover:border-gray-400={!pan.isPanning}
          class:hover:bg-gray-50={!pan.isPanning}
          class="flex h-8 w-8 items-center justify-center rounded-md border transition-colors duration-150"
          title="Toggle Pan Tool"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" />
            <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
            <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
            <path
              d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"
            />
          </svg>
        </button>
      </div>
    {/if}
    <div class="relative flex w-full flex-1 overflow-hidden">
      <GlobalPointerProvider {documentId}>
        <Viewport {documentId} class="flex-grow bg-gray-100">
          <Scroller {documentId} {renderPage} />
        </Viewport>
      </GlobalPointerProvider>
    </div>
  </div>
</div>

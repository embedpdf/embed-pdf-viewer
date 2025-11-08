<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { useZoom } from '@embedpdf/plugin-zoom/svelte';
  import { TilingLayer } from '@embedpdf/plugin-tiling/svelte';

  const zoom = useZoom();
</script>

{#snippet RenderPageSnippet(page: RenderPageProps)}
  <div style:width={`${page.width}px`} style:height={`${page.height}px`} style:position="relative">
    <RenderLayer pageIndex={page.pageIndex} scale={1} />
    <TilingLayer pageIndex={page.pageIndex} scale={page.scale} />
  </div>
{/snippet}

<div style="height: 500px">
  <div class="flex h-full flex-col">
    {#if zoom.provides}
      <div
        class="mb-4 mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <button
          onclick={() => zoom.provides?.zoomOut()}
          title="Zoom Out"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:bg-gray-50"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          onclick={() => zoom.provides?.zoomIn()}
          title="Zoom In"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:bg-gray-50"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    {/if}
    <div class="relative flex w-full flex-1 overflow-hidden">
      <Viewport class="flex-grow bg-gray-100">
        <Scroller {RenderPageSnippet} />
      </Viewport>
    </div>
  </div>
</div>

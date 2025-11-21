<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { useZoom, MarqueeZoom, ZoomMode } from '@embedpdf/plugin-zoom/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { TilingLayer } from '@embedpdf/plugin-tiling/svelte';

  let { documentId }: { documentId: string } = $props();

  const zoom = useZoom(() => documentId);
</script>

{#snippet renderPage(page: RenderPageProps)}
  <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
    <RenderLayer {documentId} pageIndex={page.pageIndex} scale={1} />
    <TilingLayer {documentId} pageIndex={page.pageIndex} />
    <MarqueeZoom {documentId} pageIndex={page.pageIndex} />
  </PagePointerProvider>
{/snippet}

<div style="height: 500px">
  <div class="flex h-full flex-col">
    <div
      class="mb-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
    >
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium uppercase tracking-wide text-gray-600">Zoom</span>
        <div
          class="min-w-[60px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center font-mono text-sm text-gray-800"
        >
          {Math.round(zoom.state.currentZoomLevel * 100)}%
        </div>
      </div>
      <div class="h-6 w-px bg-gray-200"></div>
      <div class="flex items-center gap-1">
        <button
          onclick={() => zoom.provides?.zoomOut()}
          class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
          title="Zoom Out"
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
            <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
            <path d="M7 10l6 0" />
            <path d="M21 21l-6 -6" />
          </svg>
        </button>
        <button
          onclick={() => zoom.provides?.zoomIn()}
          class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
          title="Zoom In"
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
            <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
            <path d="M7 10l6 0" />
            <path d="M10 7l0 6" />
            <path d="M21 21l-6 -6" />
          </svg>
        </button>
        <button
          onclick={() => zoom.provides?.requestZoom(ZoomMode.FitPage)}
          class="ml-1 flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
          title="Reset Zoom to Fit Page"
        >
          Reset
        </button>
      </div>
      <div class="h-6 w-px bg-gray-200"></div>
      <button
        onclick={() => zoom.provides?.toggleMarqueeZoom()}
        class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
        title="Toggle Area Zoom"
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
          <path d="M15 13v4" />
          <path d="M13 15h4" />
          <path d="M15 15m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" />
          <path d="M22 22l-3 -3" />
          <path d="M6 18h-1a2 2 0 0 1 -2 -2v-1" />
          <path d="M3 11v-1" />
          <path d="M3 6v-1a2 2 0 0 1 2 -2h1" />
          <path d="M10 3h1" />
          <path d="M15 3h1a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
    </div>
    <div class="flex-grow" style="position: relative">
      <Viewport
        {documentId}
        style="
          background-color: #f1f3f5;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        "
      >
        <Scroller {documentId} {renderPage} />
      </Viewport>
    </div>
  </div>
</div>

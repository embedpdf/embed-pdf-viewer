<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { useZoom, MarqueeZoom, ZoomMode } from '@embedpdf/plugin-zoom/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { TilingLayer } from '@embedpdf/plugin-tiling/svelte';
  import { ZoomIn, ZoomOut, RotateCcw, Scan } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const zoom = useZoom(() => documentId);
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <!-- Toolbar -->
  {#if zoom.provides}
    <div
      class="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Zoom
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        <button
          onclick={() => zoom.provides?.zoomOut()}
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <div
          class="min-w-[56px] rounded-md bg-white px-2 py-1 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
        >
          <span class="font-mono text-sm font-medium text-gray-700 dark:text-gray-200">
            {Math.round(zoom.state.currentZoomLevel * 100)}%
          </span>
        </div>
        <button
          onclick={() => zoom.provides?.zoomIn()}
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onclick={() => zoom.provides?.requestZoom(ZoomMode.FitPage)}
          class="ml-1 inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Reset Zoom to Fit Page"
        >
          <RotateCcw size={14} />
          <span class="hidden sm:inline">Reset</span>
        </button>
      </div>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <button
        onclick={() => zoom.provides?.toggleMarqueeZoom()}
        class={[
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
          zoom.state.isMarqueeZoomActive
            ? 'bg-blue-500 text-white ring-1 ring-blue-600'
            : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600',
        ].join(' ')}
        title="Toggle Area Zoom"
      >
        <Scan size={14} />
        <span class="hidden sm:inline">Area Zoom</span>
      </button>
      {#if zoom.state.isMarqueeZoomActive}
        <span class="hidden animate-pulse text-xs text-blue-600 sm:inline dark:text-blue-400">
          Click and drag to zoom into area
        </span>
      {/if}
    </div>
  {/if}

  <!-- PDF Viewer Area -->
  <div class="relative h-[400px] sm:h-[500px]">
    {#snippet renderPage(page: RenderPageProps)}
      <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
        <RenderLayer {documentId} pageIndex={page.pageIndex} scale={1} />
        <TilingLayer {documentId} pageIndex={page.pageIndex} />
        <MarqueeZoom {documentId} pageIndex={page.pageIndex} />
      </PagePointerProvider>
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>

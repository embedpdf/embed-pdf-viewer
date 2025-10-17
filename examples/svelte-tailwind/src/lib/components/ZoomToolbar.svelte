<script lang="ts">
  import { useZoom } from '@embedpdf/plugin-zoom/svelte';
  import { ZoomMode } from '@embedpdf/plugin-zoom';

  interface ZoomToolbarProps {
    withMarqueeZoom?: boolean;
  }

  let { withMarqueeZoom = false }: ZoomToolbarProps = $props();

  const { provides: zoom, state } = $derived(useZoom());
</script>

{#if zoom}
  <div
    class="mb-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
  >
    <!-- Zoom Level Display -->
    <div class="flex items-center gap-2">
      <span class="tracking-wide text-xs font-medium uppercase text-gray-600"> Zoom </span>
      <div
        class="min-w-[60px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-center font-mono text-sm text-gray-800"
      >
        {Math.round(state.currentZoomLevel * 100)}%
      </div>
    </div>

    <div class="h-6 w-px bg-gray-200"></div>

    <!-- Zoom Controls -->
    <div class="flex items-center gap-1">
      <button
        class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
        onclick={zoom.zoomOut}
        title="Zoom Out"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
          <path d="M7 10l6 0" />
          <path d="M21 21l-6 -6" />
        </svg>
      </button>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
        onclick={zoom.zoomIn}
        title="Zoom In"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
          <path d="M7 10l6 0" />
          <path d="M10 7l0 6" />
          <path d="M21 21l-6 -6" />
        </svg>
      </button>
      <button
        class="ml-1 flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
        onclick={() => zoom.requestZoom(ZoomMode.FitPage)}
        title="Reset Zoom to Fit Page"
      >
        Reset
      </button>
    </div>

    <!--  Conditionally render Marquee Zoom toggle -->
    {#if withMarqueeZoom}
      <div class="h-6 w-px bg-gray-200"></div>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
        onclick={zoom.toggleMarqueeZoom}
        title="Toggle Area Zoom"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
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
    {/if}
  </div>
{/if}

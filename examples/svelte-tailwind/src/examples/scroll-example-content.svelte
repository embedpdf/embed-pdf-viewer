<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, useScroll, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';

  const scroll = useScroll();
  let pageInput = $state(String(scroll.state.currentPage));

  $effect(() => {
    pageInput = String(scroll.state.currentPage);
  });

  const handleGoToPage = (e: Event) => {
    e.preventDefault();
    const pageNumber = parseInt(pageInput, 10);
    if (pageNumber >= 1 && pageNumber <= scroll.state.totalPages) {
      scroll.provides?.scrollToPage({ pageNumber });
    }
  };
</script>

{#snippet RenderPageSnippet(page: RenderPageProps)}
  <div style:width={`${page.width}px`} style:height={`${page.height}px`} style:position="relative">
    <RenderLayer pageIndex={page.pageIndex} scale={page.scale} />
  </div>
{/snippet}

<div style="height: 500px">
  <div class="flex h-full flex-col">
    <div
      class="mb-4 mt-4 flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
    >
      <button
        onclick={() => scroll.provides?.scrollToPreviousPage()}
        disabled={scroll.state.currentPage <= 1}
        class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-50"
        title="Previous Page"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <form onsubmit={handleGoToPage} class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-600">Page</span>
        <input
          bind:value={pageInput}
          type="number"
          min="1"
          max={scroll.state.totalPages}
          class="h-8 w-16 rounded-md border-gray-300 text-center text-sm shadow-sm"
        />
        <span class="text-sm font-medium text-gray-600">of {scroll.state.totalPages}</span>
      </form>
      <button
        onclick={() => scroll.provides?.scrollToNextPage()}
        disabled={scroll.state.currentPage >= scroll.state.totalPages}
        class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-50"
        title="Next Page"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
    <div class="relative flex w-full flex-1 overflow-hidden">
      <Viewport class="flex-grow bg-gray-100">
        <Scroller {RenderPageSnippet} />
      </Viewport>
    </div>
  </div>
</div>

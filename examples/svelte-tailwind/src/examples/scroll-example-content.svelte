<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, useScroll, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const scroll = useScroll(() => documentId);
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

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <!-- Navigation Toolbar -->
  <div
    class="flex items-center justify-center gap-2 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <button
      onclick={() => scroll.provides?.scrollToPreviousPage()}
      disabled={scroll.state.currentPage <= 1}
      class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
      title="Previous Page"
    >
      <ChevronLeft size={18} />
    </button>
    <form onsubmit={handleGoToPage} class="flex items-center gap-2">
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Page
      </span>
      <input
        bind:value={pageInput}
        type="number"
        min="1"
        max={scroll.state.totalPages}
        class="h-8 w-14 rounded-md border-0 bg-white px-2 text-center font-mono text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600"
      />
      <span class="text-xs font-medium text-gray-600 dark:text-gray-300">
        of {scroll.state.totalPages}
      </span>
    </form>
    <button
      onclick={() => scroll.provides?.scrollToNextPage()}
      disabled={scroll.state.currentPage >= scroll.state.totalPages}
      class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
      title="Next Page"
    >
      <ChevronRight size={18} />
    </button>
  </div>

  <!-- PDF Viewer Area -->
  <div class="relative h-[400px] sm:h-[500px]">
    {#snippet renderPage(page: RenderPageProps)}
      <RenderLayer {documentId} pageIndex={page.pageIndex} />
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>

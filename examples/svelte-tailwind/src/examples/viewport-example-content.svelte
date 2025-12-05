<script lang="ts">
  import {
    Viewport,
    useViewportCapability,
    useViewportScrollActivity,
  } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { ChevronsUp, ChevronsDown, AlignCenterVertical } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const viewportCapability = useViewportCapability();
  const viewport = $derived(viewportCapability.provides?.forDocument(documentId));
  const scrollActivity = useViewportScrollActivity(() => documentId);

  const scrollToTop = () => {
    viewport?.scrollTo({ x: 0, y: 0, behavior: 'smooth' });
  };

  const scrollToMiddle = () => {
    if (!viewport) return;
    const metrics = viewport.getMetrics();
    viewport.scrollTo({
      y: metrics.scrollHeight / 2,
      x: 0,
      behavior: 'smooth',
      center: true,
    });
  };

  const scrollToBottom = () => {
    if (!viewport) return;
    const metrics = viewport.getMetrics();
    viewport.scrollTo({ y: metrics.scrollHeight, x: 0, behavior: 'smooth' });
  };
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <!-- Toolbar -->
  <div
    class="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
      Scroll
    </span>
    <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
    <div class="flex items-center gap-1.5">
      <button
        onclick={scrollToTop}
        disabled={!viewport}
        class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
      >
        <ChevronsUp size={14} />
        <span class="hidden sm:inline">Top</span>
      </button>
      <button
        onclick={scrollToMiddle}
        disabled={!viewport}
        class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
      >
        <AlignCenterVertical size={14} />
        <span class="hidden sm:inline">Middle</span>
      </button>
      <button
        onclick={scrollToBottom}
        disabled={!viewport}
        class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
      >
        <ChevronsDown size={14} />
        <span class="hidden sm:inline">Bottom</span>
      </button>
    </div>
    <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
    <div class="flex items-center gap-2">
      <div
        class={[
          'h-2 w-2 rounded-full transition-colors duration-200',
          scrollActivity.current.isScrolling
            ? 'animate-pulse bg-green-500'
            : 'bg-gray-300 dark:bg-gray-600',
        ].join(' ')}
      ></div>
      <span class="text-xs text-gray-600 dark:text-gray-300">
        {scrollActivity.current.isScrolling ? 'Scrolling...' : 'Idle'}
      </span>
    </div>
  </div>

  <!-- PDF Viewer Area -->
  <div class="relative h-[400px] sm:h-[500px]">
    {#snippet renderPage(page: RenderPageProps)}
      <div style:width="{page.width}px" style:height="{page.height}px" style:position="relative">
        <RenderLayer {documentId} pageIndex={page.pageIndex} scale={1} />
      </div>
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>

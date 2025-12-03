<script lang="ts">
  import {
    Viewport,
    useViewportCapability,
    useViewportScrollActivity,
  } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';

  let { documentId }: { documentId: string } = $props();

  const viewportCapability = useViewportCapability();
  const viewport = $derived(viewportCapability.provides?.forDocument(documentId));
  const scrollActivity = useViewportScrollActivity(() => documentId);

  const scrollToTop = () => {
    viewport?.scrollTo({ x: 0, y: 0, behavior: 'smooth' });
  };

  const scrollToMiddle = () => {
    if (!viewport) return;
    const metrics = viewport?.getMetrics();
    viewport?.scrollTo({
      y: metrics.scrollHeight / 2,
      x: 0,
      behavior: 'smooth',
      center: true,
    });
  };

  const scrollToBottom = () => {
    if (!viewport) return;
    const metrics = viewport?.getMetrics();
    viewport?.scrollTo({ y: metrics.scrollHeight, x: 0, behavior: 'smooth' });
  };
</script>

{#snippet renderPage(page: RenderPageProps)}
  <div style:width={`${page.width}px`} style:height={`${page.height}px`} style:position="relative">
    <RenderLayer {documentId} pageIndex={page.pageIndex} scale={1} />
  </div>
{/snippet}

<div style="height: 500px">
  <div class="flex h-full flex-col">
    <div
      class="mb-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
    >
      <div class="flex items-center gap-2">
        <button
          onclick={scrollToTop}
          disabled={!viewport}
          class="rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 disabled:opacity-50"
        >
          Scroll to Top
        </button>
        <button
          onclick={scrollToMiddle}
          disabled={!viewport}
          class="rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 disabled:opacity-50"
        >
          Scroll to Middle
        </button>
        <button
          onclick={scrollToBottom}
          disabled={!viewport}
          class="rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 disabled:opacity-50"
        >
          Scroll to Bottom
        </button>
      </div>
      <div class="h-6 w-px bg-gray-200"></div>
      <div class="flex items-center">
        <div
          class={`h-3 w-3 rounded-full transition-colors duration-200 ${
            scrollActivity.current.isScrolling ? 'bg-green-500' : 'bg-gray-300'
          }`}
        ></div>
        <span class="ml-2 min-w-[100px] text-sm font-medium text-gray-600">
          {scrollActivity.current.isScrolling ? 'Scrolling...' : 'Idle'}
        </span>
      </div>
    </div>
    <div class="relative flex w-full flex-1 overflow-hidden">
      <Viewport {documentId} class="flex-grow bg-gray-100">
        <Scroller {documentId} {renderPage} />
      </Viewport>
    </div>
  </div>
</div>

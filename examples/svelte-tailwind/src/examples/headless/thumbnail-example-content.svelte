<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, useScroll, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { ThumbnailsPane, ThumbImg, type ThumbMeta } from '@embedpdf/plugin-thumbnail/svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const scroll = useScroll(() => documentId);
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <div class="flex h-[400px] sm:h-[500px]">
    <!-- Thumbnail Sidebar -->
    <div
      class="h-full w-[140px] flex-shrink-0 border-r border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
    >
      <ThumbnailsPane {documentId}>
        {#snippet children(meta: ThumbMeta)}
          <button
            type="button"
            class="absolute flex w-full cursor-pointer flex-col items-center px-2 bg-transparent border-0"
            style:height="{meta.wrapperHeight}px"
            style:top="{meta.top}px"
            onclick={() => scroll.provides?.scrollToPage?.({ pageNumber: meta.pageIndex + 1 })}
          >
            <div
              class={[
                'overflow-hidden rounded-md transition-all',
                scroll.state.currentPage === meta.pageIndex + 1
                  ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-50 dark:ring-offset-gray-900'
                  : 'ring-1 ring-gray-300 hover:ring-gray-400 dark:ring-gray-700 dark:hover:ring-gray-600',
              ].join(' ')}
              style:width="{meta.width}px"
              style:height="{meta.height}px"
            >
              <ThumbImg
                {documentId}
                {meta}
                style="width: 100%; height: 100%; object-fit: contain;"
              />
            </div>
            <div class="mt-1 flex items-center justify-center" style:height="{meta.labelHeight}px">
              <span
                class={[
                  'text-xs font-medium',
                  scroll.state.currentPage === meta.pageIndex + 1
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300',
                ].join(' ')}
              >
                {meta.pageIndex + 1}
              </span>
            </div>
          </button>
        {/snippet}
      </ThumbnailsPane>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative flex-1">
      {#snippet renderPage(page: RenderPageProps)}
        <RenderLayer {documentId} pageIndex={page.pageIndex} />
      {/snippet}
      <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller {documentId} {renderPage} />
      </Viewport>
    </div>
  </div>
</div>

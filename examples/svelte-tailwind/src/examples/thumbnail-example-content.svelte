<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, useScroll, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { ThumbnailsPane, ThumbImg, type ThumbMeta } from '@embedpdf/plugin-thumbnail/svelte';

  const scroll = useScroll();
</script>

{#snippet RenderPageSnippet(page: RenderPageProps)}
  <div style:width={`${page.width}px`} style:height={`${page.height}px`} style:position="relative">
    <RenderLayer pageIndex={page.pageIndex} scale={page.scale} />
  </div>
{/snippet}

<div style="height: 500px; margin-top: 10px">
  <div style="display: flex; height: 100%">
    <div
      style="
        width: 150px;
        height: 100%;
        background-color: #f8f9fa;
        border-right: 1px solid #dee2e6;
      "
    >
      <ThumbnailsPane>
        {#snippet children(meta: ThumbMeta)}
          <div
            role="button"
            tabindex="0"
            style:position="absolute"
            style:width="100%"
            style:height={`${meta.wrapperHeight}px`}
            style:top={`${meta.top}px`}
            style:display="flex"
            style:flex-direction="column"
            style:align-items="center"
            style:cursor="pointer"
            style:padding="4px"
            onclick={() => scroll.provides?.scrollToPage?.({ pageNumber: meta.pageIndex + 1 })}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                scroll.provides?.scrollToPage?.({ pageNumber: meta.pageIndex + 1 });
              }
            }}
          >
            <div
              style:width={`${meta.width}px`}
              style:height={`${meta.height}px`}
              style:border={`2px solid ${scroll.state.currentPage === meta.pageIndex + 1 ? '#0d6efd' : '#ced4da'}`}
              style:border-radius="4px"
              style:overflow="hidden"
              style:box-shadow={scroll.state.currentPage === meta.pageIndex + 1
                ? '0 0 5px rgba(13, 110, 253, 0.5)'
                : 'none'}
            >
              <ThumbImg {meta} style="width: 100%; height: 100%; object-fit: contain" />
            </div>
            <div
              style:height={`${meta.labelHeight}px`}
              style:display="flex"
              style:align-items="center"
              style:justify-content="center"
              style:margin-top="4px"
            >
              <span style="font-size: 12px; color: #6c757d">{meta.pageIndex + 1}</span>
            </div>
          </div>
        {/snippet}
      </ThumbnailsPane>
    </div>
    <div style="flex: 1; overflow: hidden; position: relative">
      <Viewport
        style="
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #f1f3f5;
        "
      >
        <Scroller {RenderPageSnippet} />
      </Viewport>
    </div>
  </div>
</div>

<script lang="ts">
  import { ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/svelte';
  import { useScroll } from '@embedpdf/plugin-scroll/svelte';
  import type { ThumbMeta } from '@embedpdf/plugin-thumbnail';

  const scroll = useScroll();

  const getIsActive = (pageIndex: number) => {
    return scroll.state.currentPage === pageIndex + 1;
  };

  const handleClick = (pageIndex: number) => {
    scroll.provides?.scrollToPage({
      pageNumber: pageIndex + 1, // 1-based
      behavior: 'smooth',
    });
  };
</script>

<div class="sidebar">
  <ThumbnailsPane style="width: 100%; height: 100%;" class="thumbs-viewport">
    {#snippet children(meta: ThumbMeta)}
      <!-- absolute-positioned row inside the virtualized pane -->
      <div
        class="thumb-row"
        class:active={getIsActive(meta.pageIndex)}
        style:position="absolute"
        style:top="{meta.top}px"
        style:left="0"
        style:right="0"
        style:height="{meta.wrapperHeight}px"
        onclick={() => handleClick(meta.pageIndex)}
        role="button"
        tabindex="0"
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(meta.pageIndex);
          }
        }}
      >
        <div
          class="thumb-img-wrapper"
          style:padding="{meta.padding || 0}px"
          style:box-sizing="content-box"
        >
          <ThumbImg
            class="thumb-img"
            {meta}
            style="width: {meta.width}px; height: {meta.height}px; display: block;"
          />
        </div>
        <div class="thumb-label" style:height="{meta.labelHeight}px">
          Page {meta.pageIndex + 1}
        </div>
      </div>
    {/snippet}
  </ThumbnailsPane>
</div>

<style>
  .sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: white;
    border-right: 1px solid #e5e7eb;
  }

  /* Scroll container lives inside ThumbnailsPane; we just size it via props */
  .thumbs-viewport {
    position: relative;
  }

  /* One row per thumb (image + label) */
  .thumb-row {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    border-left: 3px solid transparent;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }

  .thumb-row:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  /* Active page highlight */
  .thumb-row.active {
    background: rgba(59, 130, 246, 0.1);
    border-left-color: rgb(59, 130, 246);
  }

  /* Thumbnail image box */
  .thumb-img-wrapper {
    border-radius: 2px;
    overflow: hidden;
  }

  .thumb-row :global(.thumb-img) {
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.08) inset,
      0 1px 2px rgba(0, 0, 0, 0.12);
  }

  /* Label under each image */
  .thumb-label {
    font-size: 12px;
    line-height: 16px;
    color: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>

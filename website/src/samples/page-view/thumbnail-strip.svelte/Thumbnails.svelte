<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage, useStage, useStageState } from '@embedpdf/svelte/stage';
  import { ThumbsToken } from './thumbs-token';

  const main = useStage();
  const thumbs = useStage(ThumbsToken);
  const view = useStageState();

  // Keep the current page's thumbnail in view as the reader moves.
  $effect(() => {
    thumbs.reveal(view.currentPageIndex);
  });
</script>

<Stage token={ThumbsToken} class="strip">
  {#snippet children(page)}
    <button
      type="button"
      class="thumb"
      aria-label="Page {page.pageIndex + 1}"
      aria-current={page.pageIndex === view.currentPageIndex}
      onclick={() => main.goToPage(page.ref)}
    >
      <RenderLayer />
    </button>
  {/snippet}
  {#snippet pageChrome(page)}
    <span class="number" style:height="{page.frame.bottom}px">{page.pageIndex + 1}</span>
  {/snippet}
</Stage>

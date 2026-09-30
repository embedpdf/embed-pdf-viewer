<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage, useStage, useStageState } from '@embedpdf/svelte/stage';
  import { ThumbsToken } from './thumbnail-strip-token';

  const main = useStage();
  const thumbs = useStage(ThumbsToken);
  const state = useStageState();

  // Keep the current page's thumbnail in view as the reader moves
  $effect(() => {
    thumbs.reveal(state.currentPageIndex);
  });
</script>

<Stage token={ThumbsToken} interaction={false} zoomGestures={false}>
  {#snippet page(page)}
    <button
      onclick={() => main.goToPage(page.ref)}
      aria-current={page.pageIndex === state.currentPageIndex}
    >
      <RenderLayer />
    </button>
  {/snippet}
  {#snippet pageChrome(page)}
    <span class="label">{page.pageIndex + 1}</span>
  {/snippet}
</Stage>

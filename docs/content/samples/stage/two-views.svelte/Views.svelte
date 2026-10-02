<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage, useStage, useStageState } from '@embedpdf/svelte/stage';
  import { OverviewToken } from './overview-token';
  import ZoomBar from './ZoomBar.svelte';

  const main = useStage();
  const current = useStageState((state) => state.currentPageIndex);
</script>

<div class="views">
  <section class="view overview">
    <ZoomBar label="Overview" token={OverviewToken} />
    <Stage token={OverviewToken} class="stage">
      {#snippet children(page)}
        <button
          type="button"
          class="page-button"
          aria-label="Go to page {page.pageIndex + 1}"
          aria-current={page.pageIndex === current.current}
          onclick={() => main.goToPage(page.ref)}
        >
          <RenderLayer />
        </button>
      {/snippet}
    </Stage>
  </section>
  <section class="view main">
    <ZoomBar label="Main view" />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </section>
</div>

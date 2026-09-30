<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage, useStageEvent } from '@embedpdf/svelte/stage';
  import { analytics } from './analytics';

  useStageEvent(
    (stage) => stage.onPageChanged,
    ({ pageIndex }) => analytics.track('page_view', { page: pageIndex + 1 }),
  );
</script>

<Stage>
  {#snippet page()}
    <RenderLayer />
  {/snippet}
</Stage>

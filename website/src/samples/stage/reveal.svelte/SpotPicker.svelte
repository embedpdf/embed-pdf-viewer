<script lang="ts">
  import { onMount } from 'svelte';
  import { useStage, useStageState, type RevealZoom } from '@embedpdf/svelte/stage';
  import { SPOTS, ZOOMS } from './spots';

  let { active = $bindable(), zoom = $bindable() }: { active: number; zoom: RevealZoom } = $props();

  const stage = useStage();
  const pageCount = useStageState((state) => state.pageCount);

  function reveal(index: number, revealZoom: RevealZoom) {
    const spot = SPOTS[index];
    // The box lands about a third from the top, like a browser's find bar.
    stage.reveal(spot.page, { rect: spot.rect, zoom: revealZoom, anchor: { y: 0.35 } });
    active = index;
  }

  // Open on the first spot.
  onMount(() => {
    stage.reveal(SPOTS[0].page, { rect: SPOTS[0].rect, zoom: 'fit-width', anchor: { y: 0.35 } });
  });
</script>

<div class="toolbar">
  <div class="spots">
    {#each SPOTS as spot, index (spot.label)}
      <button
        type="button"
        class="button"
        aria-pressed={index === active}
        disabled={spot.page >= pageCount.current}
        onclick={() => reveal(index, zoom)}
      >
        {spot.label}
      </button>
    {/each}
  </div>
  <div class="segmented" role="group" aria-label="Zoom">
    {#each ZOOMS as option (option.label)}
      <button
        type="button"
        aria-pressed={option.zoom === zoom}
        onclick={() => (zoom = option.zoom)}
      >
        {option.label}
      </button>
    {/each}
  </div>
</div>

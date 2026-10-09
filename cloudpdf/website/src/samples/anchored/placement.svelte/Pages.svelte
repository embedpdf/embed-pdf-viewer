<script lang="ts">
  import type { AnchoredPlacement, AnchoredSide } from '@embedpdf/svelte/anchored';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { SearchLayer, useSearch } from '@embedpdf/svelte/search';
  import { Stage } from '@embedpdf/svelte/stage';
  import MatchCard from './MatchCard.svelte';

  const SIDES: AnchoredSide[] = ['top', 'right', 'bottom', 'left'];
  const ALIGNS = ['start', 'center', 'end'] as const;

  const search = useSearch();
  let side = $state<AnchoredSide>('top');
  let align = $state<(typeof ALIGNS)[number]>('center');
  let gap = $state(8);
  let pinned = $state(false);
  const placement = $derived<AnchoredPlacement>(align === 'center' ? side : `${side}-${align}`);

  $effect(() => {
    void search.search({ text: 'PDF' }).then(() => search.revealActiveHit());
  });
</script>

<div class="toolbar">
  <div class="segmented" role="radiogroup" aria-label="Side">
    {#each SIDES as each (each)}
      <button
        type="button"
        role="radio"
        aria-checked={each === side}
        class="segment"
        onclick={() => (side = each)}
      >
        {each}
      </button>
    {/each}
  </div>
  <div class="segmented" role="radiogroup" aria-label="Along the side">
    {#each ALIGNS as each (each)}
      <button
        type="button"
        role="radio"
        aria-checked={each === align}
        class="segment"
        onclick={() => (align = each)}
      >
        {each}
      </button>
    {/each}
  </div>
  <label class="range">
    Gap {gap} px
    <input type="range" min={-24} max={32} bind:value={gap} />
  </label>
  <label class="switch">
    <input type="checkbox" bind:checked={pinned} />
    Pinned
  </label>
</div>
<Stage class="stage">
  <RenderLayer />
  <SearchLayer />
  {#snippet overlay()}
    <MatchCard {placement} {gap} {pinned} />
  {/snippet}
</Stage>

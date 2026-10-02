<!-- A card next to the active match, where you put it, `gap` pixels away. -->
<script lang="ts">
  import { Anchored, type AnchoredPlacement } from '@embedpdf/svelte/anchored';
  import { useSearch, useSearchState } from '@embedpdf/svelte/search';

  let { placement, gap, pinned }: { placement: AnchoredPlacement; gap: number; pinned: boolean } =
    $props();

  const search = useSearch();
  const state = useSearchState();
</script>

<Anchored
  anchor={state.activeHit && { page: state.activeHit.page, bounds: state.activeHit.bounds }}
  {placement}
  {gap}
  {pinned}
>
  <div class="card">
    <span class="card-title">Match {state.activeHitIndex + 1} of {state.hitCount}</span>
    <span class="card-page">Page {(state.activeHit?.pageIndex ?? 0) + 1}</span>
    <div class="card-steps">
      <button
        type="button"
        class="step"
        aria-label="Previous match"
        onclick={() => search.previousHit()}
      >
        ←
      </button>
      <button type="button" class="step" aria-label="Next match" onclick={() => search.nextHit()}>
        →
      </button>
    </div>
  </div>
</Anchored>

<!-- A button below the active match: it follows the match while you scroll and zoom. -->
<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { useSearch, useSearchState } from '@embedpdf/svelte/search';

  const search = useSearch();
  const state = useSearchState();
</script>

<Anchored
  anchor={state.activeHit && { page: state.activeHit.page, bounds: state.activeHit.bounds }}
  placement="bottom"
>
  <button type="button" class="pill" onclick={() => search.nextHit()}>
    {state.activeHitIndex + 1} of {state.hitCount} · Next →
  </button>
</Anchored>

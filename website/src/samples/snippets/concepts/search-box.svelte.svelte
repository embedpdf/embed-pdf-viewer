<script lang="ts">
  import { useSearch, useSearchState } from '@embedpdf/svelte/search';

  const search = useSearch();
  const state = useSearchState();
</script>

<input oninput={(event) => search.search({ text: event.currentTarget.value })} />
<span>{state.activeHitIndex + 1} of {state.hitCount}</span>
<button onclick={() => search.nextHit()}>Next</button>

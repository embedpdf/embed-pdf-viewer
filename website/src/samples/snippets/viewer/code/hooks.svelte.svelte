<script lang="ts">
  import { useSearch, useSearchState } from '@embedpdf/svelte/search';

  // A search box of your own, in the viewer's header. The functions are the headless ones.
  const search = useSearch();
  const state = useSearchState();
</script>

<form onsubmit={(event) => event.preventDefault()}>
  <input type="search" placeholder="Search" oninput={(event) => search.search({ text: event.currentTarget.value })} />
  {#if state.hitCount > 0}<span>{state.activeHitIndex + 1} of {state.hitCount}</span>{/if}
  <button type="button" onclick={() => search.nextHit()}>Next</button>
</form>

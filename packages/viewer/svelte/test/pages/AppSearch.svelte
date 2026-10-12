<!-- A search box of the app's own, with the headless search functions of `@embedpdf/svelte`. -->
<script lang="ts">
  import { useSearch, useSearchState } from '@embedpdf/svelte/search';

  const search = useSearch();
  const state = useSearchState();
</script>

<span data-check="search" data-status={state.status}>
  <input
    data-check="query"
    type="search"
    placeholder="Search (app)"
    oninput={(event) => void search.search({ text: event.currentTarget.value })}
  />
  <output data-check="hits">{state.hitCount}</output>
  <output data-check="active">{state.activeHitIndex}</output>
  <button type="button" data-check="next" onclick={() => search.nextHit()}>Next</button>
</span>

<script lang="ts">
  import { useSearch, useSearchState } from '@embedpdf/svelte/search';

  const search = useSearch();
  const searchState = useSearchState();
  let text = $state('PDF');

  // Every change searches again, replacing the last search. An empty text clears it.
  $effect(() => {
    void search.search({ text });
  });

  const count = $derived.by(() => {
    if (searchState.hitCount > 0)
      return `${searchState.activeHitIndex + 1} of ${searchState.hitCount}`;
    if (searchState.status === 'searching') return 'Searching…';
    if (searchState.status === 'complete') return 'No matches';
    return '';
  });

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    if (event.shiftKey) search.previousHit();
    else search.nextHit();
  }
</script>

<div class="toolbar">
  <input
    class="field"
    type="search"
    aria-label="Search"
    placeholder="Search…"
    bind:value={text}
    onkeydown={onKeyDown}
  />
  <output class="readout">{count}</output>
  <button
    type="button"
    class="button"
    aria-label="Previous match"
    disabled={searchState.hitCount === 0}
    onclick={() => search.previousHit()}
  >
    ↑
  </button>
  <button
    type="button"
    class="button"
    aria-label="Next match"
    disabled={searchState.hitCount === 0}
    onclick={() => search.nextHit()}
  >
    ↓
  </button>
</div>

<script lang="ts">
  import { useSearch, useSearchState, type SearchQuery } from '@embedpdf/svelte/search';

  const search = useSearch();
  const hitCount = useSearchState((state) => state.hitCount);
  const query = $state<SearchQuery>({ text: 'pdf', matchCase: false, wholeWord: false });

  // The text and the options are one query: changing either searches again. The copy reads every
  // field, so the effect follows them all.
  $effect(() => {
    void search.search({ ...query });
  });
</script>

<div class="toolbar">
  <input
    class="field"
    type="search"
    aria-label="Search"
    placeholder="Search…"
    bind:value={query.text}
  />
  <label class="option">
    <input type="checkbox" bind:checked={query.matchCase} />
    Match case
  </label>
  <label class="option">
    <input type="checkbox" bind:checked={query.wholeWord} />
    Whole words
  </label>
  <output class="readout">{hitCount.current} matches</output>
</div>

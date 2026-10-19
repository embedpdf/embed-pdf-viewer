<script lang="ts">
  import { useSearch, useSearchState } from '@embedpdf/svelte/search';

  const search = useSearch();
  const hitCount = useSearchState((state) => state.hitCount);
  let text = $state('PDF');

  $effect(() => {
    void search.search({ text });
  });
</script>

<div class="toolbar">
  <input class="field" type="search" aria-label="Search" placeholder="Search…" bind:value={text} />
  <output class="readout">{hitCount.current} matches</output>
</div>

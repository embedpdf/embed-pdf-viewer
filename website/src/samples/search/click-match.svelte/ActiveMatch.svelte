<!-- Which match is the active one: the first on load, then the one you click. -->
<script lang="ts">
  import { useSearch, useSearchState } from '@embedpdf/svelte/search';

  const search = useSearch();
  const state = useSearchState();

  $effect(() => {
    void search.search({ text: 'PDF' });
  });
</script>

<div class="toolbar">
  <output class="readout">
    {state.hitCount > 0 ? `Match ${state.activeHitIndex + 1} of ${state.hitCount}` : 'Searching…'}
  </output>
  <span class="hint">Click a highlighted match to make it the active one.</span>
</div>

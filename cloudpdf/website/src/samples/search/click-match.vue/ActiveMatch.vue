<script setup lang="ts">
import { useSearch, useSearchState } from '@embedpdf/vue/search';

// Which match is the active one: the first on load, then the one you click.
const search = useSearch();
const { hitCount, activeHitIndex } = useSearchState();

void search.search({ text: 'PDF' });
</script>

<template>
  <div class="toolbar">
    <output class="readout">
      {{ hitCount > 0 ? `Match ${activeHitIndex + 1} of ${hitCount}` : 'Searching…' }}
    </output>
    <span class="hint">Click a highlighted match to make it the active one.</span>
  </div>
</template>

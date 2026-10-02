<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSearch, useSearchState } from '@embedpdf/vue/search';

const search = useSearch();
const { hitCount, activeHitIndex, status } = useSearchState();
const text = ref('PDF');

// Every change searches again, replacing the last search. An empty text clears it.
watch(text, (value) => void search.search({ text: value }), { immediate: true });

const count = computed(() => {
  if (hitCount.value > 0) return `${activeHitIndex.value + 1} of ${hitCount.value}`;
  if (status.value === 'searching') return 'Searching…';
  if (status.value === 'complete') return 'No matches';
  return '';
});

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  if (event.shiftKey) search.previousHit();
  else search.nextHit();
}
</script>

<template>
  <div class="toolbar">
    <input
      v-model="text"
      class="field"
      type="search"
      aria-label="Search"
      placeholder="Search…"
      @keydown="onKeydown"
    />
    <output class="readout">{{ count }}</output>
    <button
      type="button"
      class="button"
      aria-label="Previous match"
      :disabled="hitCount === 0"
      @click="search.previousHit()"
    >
      ↑
    </button>
    <button
      type="button"
      class="button"
      aria-label="Next match"
      :disabled="hitCount === 0"
      @click="search.nextHit()"
    >
      ↓
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSearch, useSearchState } from '@embedpdf/vue/search';
import type { SearchQuery } from '@embedpdf/vue/search';

const search = useSearch();
const hitCount = useSearchState((state) => state.hitCount);
const query = ref<SearchQuery>({ text: 'pdf', matchCase: false, wholeWord: false });

// The text and the options are one query: changing either searches again.
watch(query, (value) => void search.search({ ...value }), { deep: true, immediate: true });
</script>

<template>
  <div class="toolbar">
    <input
      v-model="query.text"
      class="field"
      type="search"
      aria-label="Search"
      placeholder="Search…"
    />
    <label class="option">
      <input v-model="query.matchCase" type="checkbox" />
      Match case
    </label>
    <label class="option">
      <input v-model="query.wholeWord" type="checkbox" />
      Whole words
    </label>
    <output class="readout">{{ hitCount }} matches</output>
  </div>
</template>

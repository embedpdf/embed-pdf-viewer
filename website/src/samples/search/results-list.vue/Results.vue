<script setup lang="ts">
import { useSearch, useSearchHits, useSearchState } from '@embedpdf/vue/search';

// Every match with the words around it. Clicking one makes it the active match and scrolls to it.
const search = useSearch();
const hits = useSearchHits();
const activeHitIndex = useSearchState((state) => state.activeHitIndex);
</script>

<template>
  <ol class="results">
    <li v-for="(hit, index) in hits" :key="`${hit.page.objectNumber}:${hit.start}`">
      <button
        type="button"
        class="result"
        :aria-current="index === activeHitIndex"
        @click="search.goToHit(hit)"
      >
        <span class="result-page">Page {{ hit.pageIndex + 1 }}</span>
        <!-- A match has no snippet when the user may search but not copy text. -->
        <span v-if="hit.snippet" class="result-text">
          …{{ hit.snippet.before }}<mark>{{ hit.snippet.match }}</mark
          >{{ hit.snippet.after }}…
        </span>
      </button>
    </li>
  </ol>
</template>

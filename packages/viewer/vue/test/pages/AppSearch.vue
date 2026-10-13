<!-- A search box of the app's own: the headless composables, against the viewer's kernel. -->
<script setup lang="ts">
import { useSearch, useSearchState } from '@embedpdf/vue/search';

const search = useSearch();
const { hitCount, activeHitIndex, status } = useSearchState();
</script>

<template>
  <span data-check="search" :data-status="status">
    <input
      data-check="query"
      type="search"
      placeholder="Search (app)"
      @input="search.search({ text: ($event.target as HTMLInputElement).value })"
    />
    <output data-check="hits">{{ hitCount }}</output>
    <output data-check="active">{{ activeHitIndex }}</output>
    <button type="button" data-check="next" @click="search.nextHit()">Next</button>
  </span>
</template>

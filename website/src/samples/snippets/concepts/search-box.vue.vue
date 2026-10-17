<script setup lang="ts">
import { useSearch, useSearchState } from '@embedpdf/vue/search';

const search = useSearch();
const { hitCount, activeHitIndex } = useSearchState();

function onInput(event: Event) {
  search.search({ text: (event.target as HTMLInputElement).value });
}
</script>

<template>
  <input @input="onInput" />
  <span>{{ activeHitIndex + 1 }} of {{ hitCount }}</span>
  <button @click="search.nextHit()">Next</button>
</template>

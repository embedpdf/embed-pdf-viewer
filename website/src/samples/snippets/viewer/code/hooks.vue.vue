<script setup lang="ts">
import { useSearch, useSearchState } from '@embedpdf/vue/search';

// A search box of your own, in the viewer's header. The composables are the headless ones.
const search = useSearch();
const { hitCount, activeHitIndex } = useSearchState();
</script>

<template>
  <form @submit.prevent>
    <input type="search" placeholder="Search" @input="search.search({ text: ($event.target as HTMLInputElement).value })" />
    <span v-if="hitCount > 0">{{ activeHitIndex + 1 }} of {{ hitCount }}</span>
    <button type="button" @click="search.nextHit()">Next</button>
  </form>
</template>

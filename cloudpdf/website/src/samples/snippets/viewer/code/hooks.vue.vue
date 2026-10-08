<script setup lang="ts">
import { useSearch, useSearchState } from '@embedpdf/vue/search';

// A search box of your own, in the viewer's header. The composables are the headless ones.
const search = useSearch();
const state = useSearchState();
</script>

<template>
  <form @submit.prevent>
    <input type="search" placeholder="Search" @input="search.search(($event.target as HTMLInputElement).value)" />
    <span v-if="state.hitCount > 0">{{ state.activeHitIndex + 1 }} of {{ state.hitCount }}</span>
    <button type="button" @click="search.nextHit()">Next</button>
  </form>
</template>

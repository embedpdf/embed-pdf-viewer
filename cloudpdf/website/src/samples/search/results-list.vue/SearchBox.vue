<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSearch, useSearchState } from '@embedpdf/vue/search';

const search = useSearch();
const hitCount = useSearchState((state) => state.hitCount);
const text = ref('PDF');

watch(text, (value) => void search.search({ text: value }), { immediate: true });
</script>

<template>
  <div class="toolbar">
    <input v-model="text" class="field" type="search" aria-label="Search" placeholder="Search…" />
    <output class="readout">{{ hitCount }} matches</output>
  </div>
</template>

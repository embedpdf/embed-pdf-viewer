<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSearch, useSearchHits } from '@embedpdf/vue/search';
import { useSurface } from '@embedpdf/vue/shell';

const { isOpen, close } = useSurface('search');
const search = useSearch();
const hits = useSearchHits();
const text = ref('PDF');

watch(text, (query) => void search.search({ text: query }), { immediate: true });
</script>

<template>
  <aside v-if="isOpen" class="panel" aria-label="Search">
    <header class="panel-header">
      <h3 class="panel-title">Search</h3>
      <button type="button" class="close" aria-label="Close" @click="close()">×</button>
    </header>
    <input v-model="text" class="field" type="search" aria-label="Search" />
    <ol class="list">
      <li v-for="hit in hits" :key="`${hit.page.objectNumber}:${hit.start}`">
        <button type="button" class="item" @click="search.goToHit(hit)">
          <span class="item-page">Page {{ hit.pageIndex + 1 }}</span>
          <span v-if="hit.snippet" class="item-text">
            …{{ hit.snippet.before }}<mark>{{ hit.snippet.match }}</mark>{{ hit.snippet.after }}…
          </span>
        </button>
      </li>
    </ol>
  </aside>
</template>

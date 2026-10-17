<script setup lang="ts">
import { computed } from 'vue';
import { useSearch, useSearchHits } from '@embedpdf/vue/search';
import { useStage } from '@embedpdf/vue/stage';

// A search hit says where it is in page coordinates; the Stage takes them as they are.
const search = useSearch();
const stage = useStage();
const hits = useSearchHits();
// The first eight that have a place on the page.
const shown = computed(() =>
  hits.value.slice(0, 8).flatMap((hit) => (hit.bounds ? [{ hit, bounds: hit.bounds }] : [])),
);

void search.search({ text: 'PDF' });
</script>

<template>
  <ol class="hits">
    <li v-for="{ hit, bounds } in shown" :key="`${hit.page.objectNumber}:${hit.start}`">
      <button
        type="button"
        class="hit"
        @click="stage.reveal(hit.page, { rect: bounds, anchor: { y: 0.35 } })"
      >
        <span class="where">page {{ hit.pageIndex + 1 }}</span>
        <code class="rect">x {{ Math.round(bounds.x) }}, y {{ Math.round(bounds.y) }}</code>
      </button>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { RenderLayer } from '@embedpdf/vue/render';
import { SearchLayer, useSearch, useSearchState } from '@embedpdf/vue/search';
import { Stage } from '@embedpdf/vue/stage';

const search = useSearch();
const { hitCount, activeHitIndex, status } = useSearchState();

function onInput(event: Event) {
  search.search({ text: (event.target as HTMLInputElement).value });
}
</script>

<template>
  <form @submit.prevent>
    <input @input="onInput" />
    <span v-if="status === 'searching'">Searching…</span>
    <span v-if="hitCount > 0">{{ activeHitIndex + 1 }} of {{ hitCount }}</span>
    <button type="button" @click="search.previousHit()">↑</button>
    <button type="button" @click="search.nextHit()">↓</button>
  </form>

  <Stage>
    <template #page>
      <RenderLayer />
      <SearchLayer />
    </template>
  </Stage>
</template>

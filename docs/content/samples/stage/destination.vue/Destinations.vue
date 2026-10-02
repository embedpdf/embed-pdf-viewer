<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import type { PageDestination, PageInfo } from '@embedpdf/vue/runtime';
import { useStage, useStageState } from '@embedpdf/vue/stage';

const stage = useStage();
const pages = usePageList();
const { zoomLevel, currentPageIndex } = useStageState();

// Destinations as a link, a bookmark or the document's opening view give them.
const destinationsFor = (list: readonly PageInfo[]) => {
  const pageAt = (index: number) => (list[index] ?? list[list.length - 1]).ref;
  return [
    {
      label: 'xyz: page 3 at (72, 100), 200%',
      destination: { kind: 'xyz', page: pageAt(2), x: 72, y: 100, zoom: 2 },
    },
    { label: 'fit: all of page 2', destination: { kind: 'fit', page: pageAt(1) } },
    { label: 'fitH: page 1 from y = 300', destination: { kind: 'fitH', page: pageAt(0), y: 300 } },
    {
      label: 'fitR: a box on page 4',
      destination: { kind: 'fitR', page: pageAt(3), x: 72, y: 420, width: 260, height: 160 },
    },
  ] satisfies { label: string; destination: PageDestination }[];
};
const destinations = computed(() => destinationsFor(pages.value));

// Open where the first destination points.
watch(
  pages,
  (list) => {
    if (list.length > 0) stage.goToDestination(destinationsFor(list)[0].destination);
  },
  { immediate: true },
);
</script>

<template>
  <div class="toolbar">
    <button
      v-for="{ label, destination } in destinations"
      :key="label"
      type="button"
      class="button"
      @click="stage.goToDestination(destination)"
    >
      {{ label }}
    </button>
    <output class="badge">
      page <strong>{{ currentPageIndex + 1 }}</strong> ·
      <strong>{{ Math.round(zoomLevel * 100) }}%</strong>
    </output>
  </div>
</template>

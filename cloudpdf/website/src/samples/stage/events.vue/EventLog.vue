<!-- The latest stage events, newest first. Scroll, zoom or resize to add more. -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useStage, useStageEvent } from '@embedpdf/vue/stage';

interface Entry {
  id: number;
  event: string;
  detail: string;
}

const stage = useStage();
const entries = ref<Entry[]>([]);
let count = 0;
const log = (event: string, detail: string) => {
  entries.value = [{ id: count++, event, detail }, ...entries.value].slice(0, 6);
};

useStageEvent(
  (stage) => stage.onPageChanged,
  ({ pageIndex, previousPageIndex }) =>
    log('onPageChanged', `page ${previousPageIndex + 1} → ${pageIndex + 1}`),
);
useStageEvent(
  (stage) => stage.onZoomChanged,
  ({ level, mode }) => log('onZoomChanged', `${Math.round(level * 100)}%, ${mode}`),
);
useStageEvent(
  (stage) => stage.onMotionEnded,
  ({ camera }) => log('onMotionEnded', `at rest, ${Math.round(camera.zoom * 100)}%`),
);
useStageEvent(
  (stage) => stage.onViewportChanged,
  ({ size }) => log('onViewportChanged', `${Math.round(size.width)} × ${Math.round(size.height)}`),
);

// Glide to the second page on load, so the log has something to show.
onMounted(() => stage.goToPage(1));
</script>

<template>
  <ol class="log" aria-live="polite">
    <li v-for="entry in entries" :key="entry.id" class="entry">
      <code class="name">{{ entry.event }}</code>
      <span class="detail">{{ entry.detail }}</span>
    </li>
  </ol>
</template>

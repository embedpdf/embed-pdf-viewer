<!-- A reading-progress bar, from the same numbers a scrollbar uses. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useScrollMetrics } from '@embedpdf/vue/stage';

const { scrollTop, scrollHeight, clientHeight } = useScrollMetrics();
const progress = computed(() => {
  const travel = scrollHeight.value - clientHeight.value;
  return travel > 0 ? Math.round((scrollTop.value / travel) * 100) : 0;
});
</script>

<template>
  <div class="progress" role="progressbar" aria-label="Reading progress" :aria-valuenow="progress">
    <div class="progress-fill" :style="{ width: `${progress}%` }" />
  </div>
</template>

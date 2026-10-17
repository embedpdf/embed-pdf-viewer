<script setup lang="ts">
import { computed } from 'vue';
import { useInteractionState } from '@embedpdf/vue/interaction';

const { activeToolId } = useInteractionState();
const panning = computed(() => activeToolId.value === 'pan');
</script>

<template>
  <div class="toolbar">
    <span class="badge" :data-active="panning">{{ panning ? 'Hand' : 'Select' }}</span>
    <span class="readout">
      {{ panning ? 'Drag to scroll, then let go of Space' : 'Hold Space over the pages to scroll' }}
    </span>
  </div>
</template>

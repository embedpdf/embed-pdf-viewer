<script setup lang="ts">
import { onMounted } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'polyline', label: 'Polyline' },
];

const interaction = useInteraction();
const { activeToolId } = useInteractionState();

// The polygon tool is active on load: click a few points on the page.
onMounted(() => interaction.activateTool('polygon'));
</script>

<template>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Tool">
      <button
        v-for="tool in TOOLS"
        :key="tool.id"
        type="button"
        :aria-pressed="activeToolId === tool.id"
        @click="interaction.activateTool(tool.id)"
      >
        {{ tool.label }}
      </button>
    </div>
    <p class="hint">Delete removes the selection; Escape stops a shape</p>
  </div>
</template>

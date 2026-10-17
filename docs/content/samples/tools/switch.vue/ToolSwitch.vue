<script setup lang="ts">
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const LABELS: Record<string, string> = { pointer: 'Select', pan: 'Hand' };
const HINTS: Record<string, string> = {
  pointer: 'A drag selects text',
  pan: 'A drag scrolls the pages',
};

// A button for every tool you can switch to, the active one pressed.
const interaction = useInteraction();
const { activeToolId, tools } = useInteractionState();
</script>

<template>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Tool">
      <button
        v-for="tool in tools"
        :key="tool.id"
        type="button"
        class="segment"
        :aria-pressed="tool.id === activeToolId"
        @click="interaction.activateTool(tool.id)"
      >
        {{ LABELS[tool.id] ?? tool.id }}
      </button>
    </div>
    <output class="readout">{{ activeToolId ? HINTS[activeToolId] : '' }}</output>
  </div>
</template>

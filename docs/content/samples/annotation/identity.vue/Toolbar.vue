<script setup lang="ts">
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'square', label: 'Rectangle' },
  { id: 'note', label: 'Note' },
];

const interaction = useInteraction();
const { activeToolId } = useInteractionState();
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
  </div>
</template>

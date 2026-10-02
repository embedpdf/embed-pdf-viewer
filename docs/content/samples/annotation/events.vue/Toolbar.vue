<script setup lang="ts">
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'square', label: 'Rectangle' },
  { id: 'ink', label: 'Pen' },
];

const annotation = useAnnotation();
const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const { selected } = useAnnotationState();
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
    <button
      type="button"
      class="button"
      :disabled="selected.length === 0"
      @click="annotation.selection.delete()"
    >
      Delete
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useAnnotationList } from '@embedpdf/vue/annotation';

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'square', label: 'Rectangle' },
  { id: 'ink', label: 'Pen' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'note', label: 'Note' },
];

const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const annotations = useAnnotationList();
const count = computed(() => annotations.value.length);

// The rectangle tool is active on load: drag on the page to draw one.
onMounted(() => interaction.activateTool('square'));
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
    <output class="readout">{{ count }} {{ count === 1 ? 'annotation' : 'annotations' }}</output>
  </div>
</template>

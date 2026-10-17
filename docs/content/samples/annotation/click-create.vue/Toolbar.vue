<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const TOOLS = [
  { id: 'square', label: 'Rectangle', hint: 'A click makes 120 × 80 points' },
  { id: 'arrow', label: 'Arrow', hint: 'A click points an arrow down at it' },
  { id: 'circle', label: 'Circle', hint: 'Drag only: a click does nothing' },
];

const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const active = computed(() => TOOLS.find((tool) => tool.id === activeToolId.value));

// The rectangle tool is active on load: click the page.
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
    <p class="hint">{{ active?.hint ?? 'Pick a tool, then click the page' }}</p>
  </div>
</template>

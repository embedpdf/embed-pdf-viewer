<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useAnnotation } from '@embedpdf/vue/annotation';

// A toolbar that builds itself from the tools: every tool with a label gets a button.
const annotation = useAnnotation();
const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const labelled = computed(() =>
  annotation.tools.list().filter((tool) => typeof tool.meta?.label === 'string'),
);

// On load: the arrow tool is active.
onMounted(() => interaction.activateTool('arrow'));
</script>

<template>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Tool">
      <button
        type="button"
        :aria-pressed="activeToolId === 'pointer'"
        @click="interaction.activateTool('pointer')"
      >
        Select
      </button>
      <button
        v-for="tool in labelled"
        :key="tool.id"
        type="button"
        :aria-pressed="activeToolId === tool.id"
        @click="interaction.activateTool(tool.id)"
      >
        {{ String(tool.meta?.label) }}
      </button>
    </div>
  </div>
</template>

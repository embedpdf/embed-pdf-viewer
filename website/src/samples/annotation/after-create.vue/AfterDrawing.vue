<script setup lang="ts">
import { onMounted } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useAnnotation, useAnnotationSettings } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const { afterCreate } = useAnnotationSettings();

function selectIt(event: Event) {
  annotation.updateSettings({ afterCreate: { select: (event.target as HTMLInputElement).checked } });
}

function keepTheTool(event: Event) {
  annotation.updateSettings({
    afterCreate: { tool: (event.target as HTMLInputElement).checked ? 'stay' : 'default' },
  });
}

// The rectangle tool is active on load.
onMounted(() => interaction.activateTool('square'));
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :aria-pressed="activeToolId === 'square'"
      @click="interaction.activateTool('square')"
    >
      Rectangle
    </button>
    <label class="check">
      <input type="checkbox" :checked="afterCreate.select" @change="selectIt" />
      Select it
    </label>
    <label class="check">
      <input type="checkbox" :checked="afterCreate.tool === 'stay'" @change="keepTheTool" />
      Keep the tool
    </label>
    <button type="button" class="button" @click="annotation.resetSettings()">Reset</button>
    <span class="spacer" />
    <output class="readout">{{ activeToolId === 'square' ? 'Drawing' : 'Selecting' }}</output>
  </div>
</template>

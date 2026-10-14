<script setup lang="ts">
import { onMounted } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const TOOLS = [
  { id: 'note', label: 'Note' },
  { id: 'square', label: 'Rectangle' },
];

/** The ghost opacity from CSS, or `null` for each tool's own. */
const opacity = defineModel<number | null>('opacity', { required: true });

const interaction = useInteraction();
const { activeToolId } = useInteractionState();

function slide(event: Event) {
  opacity.value = Number((event.target as HTMLInputElement).value);
}

// The note tool is active on load: move the pointer over the page.
onMounted(() => interaction.activateTool('note'));
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
    <label class="range">
      From CSS
      <input type="range" min="0.1" max="0.9" step="0.1" :value="opacity ?? 0.5" @input="slide" />
      <output class="readout">
        {{ opacity === null ? "each tool's own" : `${Math.round(opacity * 100)}%` }}
      </output>
    </label>
    <button type="button" class="button" :disabled="opacity === null" @click="opacity = null">
      Reset
    </button>
  </div>
</template>

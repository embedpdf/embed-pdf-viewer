<script setup lang="ts">
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useFilePickerProvider } from '@embedpdf/vue/annotation';

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'stamp', label: 'Stamp' },
  { id: 'attachment', label: 'Attach a file' },
];

// The toolbar is always mounted, so it gives the stamp and attachment tools their file dialog.
useFilePickerProvider();
const interaction = useInteraction();
const { activeToolId } = useInteractionState();
</script>

<template>
  <div class="toolbar" role="toolbar">
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
    <p class="hint">
      <template v-if="activeToolId === 'stamp'">Click the page, then pick a PNG or a JPEG</template>
      <template v-else-if="activeToolId === 'attachment'">Click the page, then pick any file</template>
    </p>
  </div>
</template>

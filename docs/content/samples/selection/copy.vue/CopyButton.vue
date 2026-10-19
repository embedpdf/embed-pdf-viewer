<script setup lang="ts">
import { ref } from 'vue';
import { copySelection, useSelection, useSelectionState } from '@embedpdf/vue/selection';

const selection = useSelection();
const hasSelection = useSelectionState((state) => state.hasSelection);
const status = ref('');

function copy() {
  copySelection(selection).then(
    (text) => (status.value = `Copied ${text.length} characters`),
    // The browser can refuse the clipboard, for example in a frame that doesn't allow it.
    () => (status.value = "The browser didn't allow copying"),
  );
}
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :disabled="!hasSelection || !selection.canCopy()"
      @click="copy"
    >
      Copy
    </button>
    <output class="readout">{{ status || 'Or press Ctrl+C' }}</output>
  </div>
</template>

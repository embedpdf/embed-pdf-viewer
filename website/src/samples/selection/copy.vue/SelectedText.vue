<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSelection, useSelectionState } from '@embedpdf/vue/selection';

// The selected text, read with readText() each time the selection settles.
const selection = useSelection();
const { range, isSelecting } = useSelectionState();
const text = ref('');

watch(
  [range, isSelecting],
  ([, selecting], _previous, onCleanup) => {
    if (selecting || !selection.canCopy()) return;
    // A newer selection cancels a read that hasn't finished.
    const controller = new AbortController();
    selection.readText({ signal: controller.signal }).then(
      (read) => (text.value = read),
      () => {},
    );
    onCleanup(() => controller.abort());
  },
  { immediate: true },
);
</script>

<template>
  <p class="preview">{{ text || 'Select some text to read it here.' }}</p>
</template>

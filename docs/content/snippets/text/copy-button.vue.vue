<script setup lang="ts">
import { copySelection, useSelection, useSelectionState } from '@embedpdf/vue/selection';

const selection = useSelection();
const { hasSelection } = useSelectionState();
</script>

<template>
  <button :disabled="!hasSelection || !selection.canCopy()" @click="copySelection(selection)">
    Copy
  </button>
</template>

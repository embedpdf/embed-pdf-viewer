<script setup lang="ts">
import { useSelectionState } from '@embedpdf/vue/selection';

const { hasSelection, isSelecting, pages } = useSelectionState();
</script>

<template>
  <button :disabled="!hasSelection">Highlight</button>
</template>

<script setup lang="ts">
import { SelectionClipboard } from '@embedpdf/vue/selection';
</script>

<template>
  <!-- Once per document view: Ctrl+C / Cmd+C and the browser's Copy menu -->
  <SelectionClipboard />
</template>

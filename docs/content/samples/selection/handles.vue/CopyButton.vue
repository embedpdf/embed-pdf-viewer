<script setup lang="ts">
import { copySelection, useSelection } from '@embedpdf/vue/selection';

const selection = useSelection();
</script>

<template>
  <button
    type="button"
    class="button"
    :disabled="!selection.canCopy()"
    @click="copySelection(selection).catch(() => {})"
  >
    Copy
  </button>
</template>

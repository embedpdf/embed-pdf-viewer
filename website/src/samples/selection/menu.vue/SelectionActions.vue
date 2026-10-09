<script setup lang="ts">
import { copySelection, useSelection } from '@embedpdf/vue/selection';

// What's in the menu is yours: here, copy and clear.
const selection = useSelection();

function copy() {
  void copySelection(selection).catch(() => {
    // Show your product's clipboard error message here.
  });
}
</script>

<template>
  <div class="menu">
    <button v-if="selection.canCopy()" type="button" class="button" @click="copy">Copy</button>
    <button type="button" class="button" @click="selection.clear()">Clear</button>
  </div>
</template>

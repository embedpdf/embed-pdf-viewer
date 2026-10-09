<script setup lang="ts">
import { useSelection } from '@embedpdf/vue/selection';

const selection = useSelection();
</script>

<template>
  <div class="menu">
    <button type="button" @click="selection.clear()">Clear the selection</button>
  </div>
</template>

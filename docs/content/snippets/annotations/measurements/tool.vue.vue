<script setup lang="ts">
import { useInteraction } from '@embedpdf/vue/interaction';

const interaction = useInteraction();
</script>

<template>
  <button @click="interaction.activateTool('distance')">Measure</button>
</template>

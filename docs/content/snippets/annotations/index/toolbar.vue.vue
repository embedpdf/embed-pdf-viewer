<script setup lang="ts">
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const tools = ['pointer', 'square', 'ink', 'highlight', 'note'];

const interaction = useInteraction();
const { activeToolId } = useInteractionState();
</script>

<template>
  <button
    v-for="id in tools"
    :key="id"
    :aria-pressed="activeToolId === id"
    @click="interaction.activateTool(id)"
  >
    {{ id }}
  </button>
</template>

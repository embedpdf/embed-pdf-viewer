<script setup lang="ts">
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const interaction = useInteraction();
const { activeToolId } = useInteractionState();
</script>

<template>
  <button :aria-pressed="activeToolId === 'pointer'" @click="interaction.activateTool('pointer')">
    Select
  </button>
  <button :aria-pressed="activeToolId === 'pan'" @click="interaction.activateTool('pan')">
    Hand
  </button>
</template>

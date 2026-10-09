<script setup lang="ts">
import { computed } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const on = computed(() => activeToolId.value === 'highlight');
</script>

<template>
  <button :aria-pressed="on" @click="interaction.activateTool(on ? 'pointer' : 'highlight')">
    Highlight
  </button>
</template>

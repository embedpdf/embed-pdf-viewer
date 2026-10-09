<script setup lang="ts">
import { useInteractionEvent } from '@embedpdf/vue/interaction';
import { analytics } from './analytics';

useInteractionEvent(
  (interaction) => interaction.onToolChanged,
  ({ toolId }) => analytics.track('tool', { toolId }),
);
</script>

<template>
  <!-- your toolbar and pages -->
</template>

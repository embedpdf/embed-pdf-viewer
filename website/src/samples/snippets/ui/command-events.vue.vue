<script setup lang="ts">
import { useCommandsEvent } from '@embedpdf/vue/commands';
import { analytics } from './analytics';

useCommandsEvent(
  (commands) => commands.onExecuted,
  ({ commandId }) => analytics.track('command', { commandId }),
);
</script>

<template>
  <!-- your toolbar and pages -->
</template>

<script setup lang="ts">
import { useShellEvent } from '@embedpdf/vue/shell';
import { analytics } from './analytics';

useShellEvent(
  (shell) => shell.onSurfaceOpened,
  ({ id }) => analytics.track('panel', { id }),
);
</script>

<template>
  <!-- your toolbar, panels and pages -->
</template>

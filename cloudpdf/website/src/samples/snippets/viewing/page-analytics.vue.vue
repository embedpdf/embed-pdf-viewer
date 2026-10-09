<script setup lang="ts">
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage, useStageEvent } from '@embedpdf/vue/stage';
import { analytics } from './analytics';

useStageEvent(
  (stage) => stage.onPageChanged,
  ({ pageIndex }) => analytics.track('page_view', { page: pageIndex + 1 }),
);
</script>

<template>
  <Stage>
    <template #page>
      <RenderLayer />
    </template>
  </Stage>
</template>

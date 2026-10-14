<script setup lang="ts">
import { RenderLayer, useRenderEvent } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';
import { refreshMyPreviews } from './previews';

useRenderEvent(
  (render) => render.onInvalidated,
  ({ pages }) => refreshMyPreviews(pages),
);
</script>

<template>
  <Stage>
    <template #page>
      <RenderLayer />
    </template>
  </Stage>
</template>

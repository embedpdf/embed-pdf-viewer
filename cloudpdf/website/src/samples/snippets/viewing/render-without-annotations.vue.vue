<script setup lang="ts">
import { AnnotationLayer } from '@embedpdf/vue/annotation';
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';
</script>

<template>
  <Stage>
    <template #page>
      <RenderLayer :annotations="false" />
      <AnnotationLayer />
    </template>
  </Stage>
</template>

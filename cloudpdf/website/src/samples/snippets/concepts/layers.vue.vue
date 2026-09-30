<script setup lang="ts">
import { AnnotationLayer } from '@embedpdf/vue/annotation';
import { RenderLayer } from '@embedpdf/vue/render';
import { SearchLayer } from '@embedpdf/vue/search';
import { SelectionLayer } from '@embedpdf/vue/selection';
import { Stage } from '@embedpdf/vue/stage';
</script>

<template>
  <Stage>
    <template #page>
      <RenderLayer :annotations="false" />
      <SearchLayer />
      <SelectionLayer />
      <AnnotationLayer />
    </template>
  </Stage>
</template>

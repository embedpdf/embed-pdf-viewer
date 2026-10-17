<script setup lang="ts">
import { DocumentScope } from '@embedpdf/vue/runtime';
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';

defineProps<{ documentId: string }>();
</script>

<template>
  <DocumentScope :id="documentId">
    <Stage>
      <template #page><RenderLayer /></template>
    </Stage>
  </DocumentScope>
</template>

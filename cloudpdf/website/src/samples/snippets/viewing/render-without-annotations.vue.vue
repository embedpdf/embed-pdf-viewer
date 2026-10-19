<script setup lang="ts">
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';
</script>

<template>
  <Stage>
    <template #page>
      <RenderLayer :annotations="false" />
    </template>
  </Stage>
</template>

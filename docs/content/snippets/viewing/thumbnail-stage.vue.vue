<script setup lang="ts">
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';
import { ThumbsToken } from './thumbs-token';
</script>

<template>
  <Stage :token="ThumbsToken" :interaction="false">
    <template #page>
      <RenderLayer />
    </template>
  </Stage>
</template>

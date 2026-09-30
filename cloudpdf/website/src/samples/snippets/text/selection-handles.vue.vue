<script setup lang="ts">
import { RenderLayer } from '@embedpdf/vue/render';
import { SelectionHandles, SelectionLayer, SelectionMenu } from '@embedpdf/vue/selection';
import { Stage } from '@embedpdf/vue/stage';

import CopyButton from './copy-button.vue';
</script>

<template>
  <Stage>
    <template #page>
      <RenderLayer />
      <SelectionLayer />
    </template>

    <template #overlay>
      <SelectionMenu>
        <CopyButton />
      </SelectionMenu>
      <SelectionHandles />
    </template>
  </Stage>
</template>

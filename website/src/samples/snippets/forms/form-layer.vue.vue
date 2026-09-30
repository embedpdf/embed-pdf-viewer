<script setup lang="ts">
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { Viewer } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { engine } from './pdf';

const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins">
    <Stage>
      <template #page>
        <RenderLayer />
        <FormLayer />
      </template>
    </Stage>
  </Viewer>
</template>

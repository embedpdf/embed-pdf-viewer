<script setup lang="ts">
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { Viewer } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';

import { engine } from './setup';

const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins">
    <Stage>
      <template #page>
        <RenderLayer />
        <AnnotationLayer />
      </template>
    </Stage>
  </Viewer>
</template>

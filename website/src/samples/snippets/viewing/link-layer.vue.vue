<script setup lang="ts">
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { LinkLayer, linkPlugin } from '@embedpdf/vue/link';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { Viewer } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { engine } from './pdf';

const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), linkPlugin()];
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins">
    <Stage>
      <template #page>
        <RenderLayer />
        <LinkLayer />
      </template>
    </Stage>
  </Viewer>
</template>

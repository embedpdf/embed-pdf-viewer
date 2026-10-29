<script setup lang="ts">
import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/vue/runtime';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { cloudEngine } from '@cloudpdf/engine';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <Stage style="height: 500px">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

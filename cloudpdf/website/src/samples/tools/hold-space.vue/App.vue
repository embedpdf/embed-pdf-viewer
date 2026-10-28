<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { cloudEngine } from '@cloudpdf/engine';
import ActiveTool from './ActiveTool.vue';
import HoldSpaceToPan from './HoldSpaceToPan.vue';

import '../hold-space.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const welcome: OpenInput = { kind: 'share', shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <ActiveTool />
      <HoldSpaceToPan>
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <SelectionLayer />
          </template>
        </Stage>
      </HoldSpaceToPan>
    </DocumentGate>
  </Viewer>
</template>

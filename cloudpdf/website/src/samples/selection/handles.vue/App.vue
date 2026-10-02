<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import {
  SelectionHandles,
  SelectionLayer,
  SelectionMenu,
  selectionPlugin,
} from '@embedpdf/vue/selection';
import { cloudEngine } from '@cloudpdf/engine';
import CopyButton from './CopyButton.vue';
import SelectWord from './SelectWord.vue';

import '../handles.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SelectWord />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
        </template>
        <template #overlay>
          <!-- Clear of the start handle's grip, which sits above the first line. -->
          <SelectionMenu :gap="20">
            <CopyButton />
          </SelectionMenu>
          <SelectionHandles />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

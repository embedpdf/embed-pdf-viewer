<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { commandsPlugin, standardCommands } from '@embedpdf/vue/commands';
import { cloudEngine } from '@cloudpdf/engine';
import CommandPalette from './CommandPalette.vue';

import '../palette.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  commandsPlugin({ commands: standardCommands }),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <div class="layout">
        <CommandPalette />
        <Stage class="stage">
          <template #page><RenderLayer /></template>
        </Stage>
      </div>
    </DocumentGate>
  </Viewer>
</template>

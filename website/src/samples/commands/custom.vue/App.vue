<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, StageToken, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { commandsPlugin, standardCommands } from '@embedpdf/vue/commands';
import type { CommandDef } from '@embedpdf/vue/commands';
import { localEngine } from '@embedpdf/engine';
import Toolbar from './Toolbar.vue';

import '../custom.css';

const engine = localEngine();

// A command of your own: pressed while the pages show two at a time.
const twoPages: CommandDef = {
  id: 'layout:two-pages',
  label: 'Two pages',
  categories: ['layout'],
  active: ({ get }) => get(StageToken).getSettings().spread === 'odd',
  run: ({ get }) => {
    const stage = get(StageToken);
    stage.updateSettings({ spread: stage.getSettings().spread === 'odd' ? 'none' : 'odd' });
  },
};

const plugins = [
  stagePlugin(),
  renderPlugin(),
  commandsPlugin({ commands: [...standardCommands, twoPages] }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Toolbar />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

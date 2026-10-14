<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import {
  SelectionClipboard,
  SelectionLayer,
  SelectionMenu,
  selectionPlugin,
} from '@embedpdf/vue/selection';
import { localEngine } from '@embedpdf/engine';
import SelectionActions from './SelectionActions.vue';
import SelectTitle from './SelectTitle.vue';

import '../menu.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const PLACEMENTS = ['top', 'bottom', 'left', 'right'] as const;
type Placement = (typeof PLACEMENTS)[number];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const placement = ref<Placement>('top');
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SelectTitle />
      <SelectionClipboard />
      <div class="toolbar" role="group" aria-label="Where the menu goes">
        <button
          v-for="name in PLACEMENTS"
          :key="name"
          type="button"
          class="segment"
          :aria-pressed="placement === name"
          @click="placement = name"
        >
          {{ name }}
        </button>
      </div>
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
        </template>
        <template #overlay>
          <SelectionMenu :placement="placement" :gap="8">
            <SelectionActions />
          </SelectionMenu>
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

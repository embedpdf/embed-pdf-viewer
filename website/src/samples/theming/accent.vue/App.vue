<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer, epdfTheme } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { localEngine } from '@embedpdf/engine';
import SelectTitle from './SelectTitle.vue';

import '../accent.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

const SWATCHES = ['#3858e9', '#e91e63', '#0f6e56', '#c2410c'];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const accent = ref('#e91e63');
</script>

<template>
  <div class="pdf-viewer" :style="epdfTheme({ accent })">
    <div class="toolbar">
      <label class="picker">
        Accent
        <input v-model="accent" type="color" />
      </label>
      <button
        v-for="swatch in SWATCHES"
        :key="swatch"
        type="button"
        class="swatch"
        :aria-label="`Accent ${swatch}`"
        :aria-pressed="swatch === accent"
        :style="{ background: swatch }"
        @click="accent = swatch"
      />
      <code class="value">--epdf-accent: {{ accent }}</code>
    </div>
    <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
      <DocumentGate>
        <template #fallback><p class="loading">Loading…</p></template>
        <SelectTitle />
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <SelectionLayer />
          </template>
        </Stage>
      </DocumentGate>
    </Viewer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { localEngine } from '@embedpdf/engine';
import AddRectangle from './AddRectangle.vue';

import '../annotations.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

type Painter = 'picture' | 'layer';

const painter = ref<Painter>('picture');
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <AddRectangle />
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Who draws the annotations">
          <button
            type="button"
            :aria-pressed="painter === 'picture'"
            @click="painter = 'picture'"
          >
            In the page picture
          </button>
          <button type="button" :aria-pressed="painter === 'layer'" @click="painter = 'layer'">
            Drawn by the annotation layer
          </button>
        </div>
        <p class="hint">
          {{
            painter === 'picture'
              ? 'Part of the picture: it can’t be picked up.'
              : 'Left out of the picture: click it, then drag it.'
          }}
        </p>
      </div>
      <Stage class="stage">
        <template #page>
          <!-- Left out of the picture when the annotation layer draws them. -->
          <RenderLayer :annotations="painter === 'picture'" />
          <AnnotationLayer v-if="painter === 'layer'" />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

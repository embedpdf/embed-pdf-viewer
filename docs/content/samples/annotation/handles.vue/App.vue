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
import ChromeControls from './ChromeControls.vue';
import Handle from './Handle.vue';
import RotationHandle from './RotationHandle.vue';

import '../handles.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const own = ref(false);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <AddRectangle />
      <ChromeControls v-model:own="own" />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <!-- Your own handles: the layer places them, and still decides where they can be grabbed. -->
          <AnnotationLayer>
            <template v-if="own" #handle="handle"><Handle v-bind="handle" /></template>
            <template v-if="own" #rotation-handle="handle">
              <RotationHandle v-bind="handle" />
            </template>
          </AnnotationLayer>
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

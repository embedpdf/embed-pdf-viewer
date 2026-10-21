<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { actionsPlugin } from '@embedpdf/vue/actions';
import { LinkLayer, linkPlugin } from '@embedpdf/vue/link';
import { localEngine } from '@embedpdf/engine';
import BrowserActions from './BrowserActions.vue';

import '../custom.css';

const engine = localEngine();
// The actions plugin runs a link that names a viewer command, such as the cover's "Next page".
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), actionsPlugin(), linkPlugin()];

// [!doc-source links]
const links = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-links.pdf');
  return { kind: 'bytes', id: 'links', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const shown = ref(true);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: links }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <BrowserActions />
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Link areas">
          <button type="button" :aria-pressed="shown" @click="shown = true">
            Show link areas
          </button>
          <button type="button" :aria-pressed="!shown" @click="shown = false">
            As the PDF has them
          </button>
        </div>
      </div>
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <LinkLayer>
            <template #link="{ link, native }">
              <!-- Wrapping `native` keeps what a click does. -->
              <span v-if="shown" class="pdf-link" :data-kind="link.target.kind">
                <component :is="native" />
              </span>
              <!-- The layer's own, invisible area. -->
              <component :is="native" v-else />
            </template>
          </LinkLayer>
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

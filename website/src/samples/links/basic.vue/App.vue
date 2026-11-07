<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { actionsPlugin } from '@embedpdf/vue/actions';
import { LinkLayer, linkPlugin } from '@embedpdf/vue/link';
import { localEngine } from '@embedpdf/engine';
import BrowserActions from './BrowserActions.vue';

import '../basic.css';

const engine = localEngine();
// The actions plugin runs a link that names a viewer command, such as the footer's Next.
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), actionsPlugin(), linkPlugin()];

const links = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/links.pdf');
  return { kind: 'bytes', id: 'links', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: links }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <BrowserActions />
      <p class="hint">
        Every blue label is a link. Click one, or press Tab to reach it and Enter to follow it.
      </p>
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <LinkLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

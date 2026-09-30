<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';
import { engine, plugins } from './pdf';
import Spinner from './Spinner.vue';
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[{ source: { kind: 'url', url: '/files/contract.pdf' } }]"
  >
    <DocumentGate>
      <template #fallback><Spinner /></template>
      <Stage>
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

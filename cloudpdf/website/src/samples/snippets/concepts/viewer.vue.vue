<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';
import { engine, plugins, source } from './pdf';
import Toolbar from './Toolbar.vue';
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source }]">
    <Toolbar />
    <DocumentGate>
      <template #fallback><p>Opening…</p></template>
      <Stage>
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

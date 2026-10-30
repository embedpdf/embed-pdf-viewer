<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';
import { getToken } from './auth';
import { engine, plugins } from './pdf';

const withToken = (url: string, init: RequestInit) =>
  fetch(url, { ...init, headers: { Authorization: `Bearer ${getToken()}` } });
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[{ source: { kind: 'url', url: '/api/files/contract.pdf' } }]"
    :fetch="withToken"
  >
    <DocumentGate>
      <Stage>
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>

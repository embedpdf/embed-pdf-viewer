<!--
  The two doors' props, checked by `vue-tsc -p test/tsconfig.json` and never rendered: each line
  under a `@vue-expect-error` must be an error, so a door that starts taking a bad shape fails the
  check. The main door takes the built-in engine's options or none; the core door takes only a
  real engine.
-->
<script setup lang="ts">
import { PDFViewer } from '@embedpdf/viewer-vue';
import type { Engine } from '@embedpdf/viewer-vue';

import { PDFViewer as CorePDFViewer } from '../../src/core';

defineProps<{ engine: Engine }>();
</script>

<template>
  <PDFViewer src="/report.pdf" read-only />
  <PDFViewer src="/report.pdf" :engine="{ wasmUrl: '/embedpdf.wasm' }" />
  <CorePDFViewer :engine="engine" />
  <!-- @vue-expect-error The core door has no default engine. -->
  <CorePDFViewer src="/report.pdf" />
  <!-- @vue-expect-error Nor a built-in engine whose options it could take. -->
  <CorePDFViewer :engine="{ wasmUrl: '/embedpdf.wasm' }" />
  <!-- @vue-expect-error A key no viewer has. -->
  <PDFViewer :bogus="1" />
  <!-- @vue-expect-error The callbacks are events, with the viewer's payloads. -->
  <PDFViewer @ready="(documentId: string) => documentId" />
</template>

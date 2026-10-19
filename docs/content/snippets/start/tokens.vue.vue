<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';
import { fetchDocumentToken } from './api';
import { engine, plugins } from './pdf';

defineProps<{ documentId: string }>();
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[{ source: { kind: 'token', token: () => fetchDocumentToken(documentId) } }]"
  />
</template>

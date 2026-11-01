<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-vue';

const article = { grant: 'shr_v09cJHOmj3C8vrfUlZNTDyqX' };

const config: ViewerConfig = {
  plugins: {
    annotation: {
      tools: [
        { id: 'highlight', defaults: { color: '#fde047', opacity: 0.4 } },
        { id: 'ink', defaults: { color: '#1d4ed8', strokeWidth: 2 } },
      ],
    },
  },
};
</script>

<template>
  <PDFViewer :src="article" v-bind="config" style="height: 100%" />
</template>

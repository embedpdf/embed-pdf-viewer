<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-vue';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

const config: ViewerConfig = {
  layout: (layout) =>
    layout
      .place('main', 'bottom')
      .remove('zoom', { from: 'main' })
      .addBar('zoom', {
        place: { float: 'bottom-end' },
        center: [[{ custom: 'zoom' }]],
      }),
};
</script>

<template>
  <PDFViewer :src="welcome" v-bind="config" style="height: 100%" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { PDFViewer, ToolbarItem, type Layout } from '@cloudpdf/viewer-vue';
import ReviewStatus from './ReviewStatus.vue';

import '../status.css';

const proposal = { grant: 'shr_qnqHtCNRpzz-s7DPFBIbuOAF' };

const status = ref('review');

const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
</script>

<template>
  <PDFViewer :src="proposal" :layout="layout" style="height: 100%">
    <ToolbarItem id="status">
      <ReviewStatus v-model="status" />
    </ToolbarItem>
  </PDFViewer>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { PDFViewer, ToolbarItem, type Layout } from '@embedpdf/viewer-vue';
import ReviewStatus from './ReviewStatus.vue';

import '../status.css';

const proposal = '/pdfs/proposal.pdf';

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

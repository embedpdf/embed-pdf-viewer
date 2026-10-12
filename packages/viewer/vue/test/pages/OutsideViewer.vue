<!-- A component outside the viewer: `usePDFViewer()` throws there. -->
<script setup lang="ts">
import { usePDFViewer } from '@embedpdf/viewer-vue';

import type { ViewerCodeRecord } from './viewer-code';

const { record } = defineProps<{ record: ViewerCodeRecord }>();

try {
  usePDFViewer();
  record.outside = 'no error';
} catch (error) {
  record.outside = (error as Error).message;
}
</script>

<template>
  <span hidden />
</template>

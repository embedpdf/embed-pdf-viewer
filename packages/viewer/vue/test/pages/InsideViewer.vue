<!-- A component inside the viewer: the viewer, commands and a headless composable. -->
<script setup lang="ts">
import { watchEffect } from 'vue';
import { useCommand, usePDFViewer } from '@embedpdf/viewer-vue';
import { useStageState } from '@embedpdf/vue/stage';

import type { ViewerCodeRecord } from './viewer-code';

const { record, countMount } = defineProps<{
  record: ViewerCodeRecord;
  /** Counts this mount, and says how many there have been. */
  countMount: () => number;
}>();

const viewer = usePDFViewer();
const zoomIn = useCommand('zoom:in');
const pan = useCommand('tool:pan');
const missing = useCommand('acme:missing');
const { zoomLevel } = useStageState();
const mount = countMount();

watchEffect(() => {
  record.inside = {
    viewer,
    zoomLevel: zoomLevel.value,
    zoomIn: zoomIn.value,
    pan: pan.value,
    missing: missing.value,
    mounts: mount,
  };
});
</script>

<template>
  <span hidden />
</template>
